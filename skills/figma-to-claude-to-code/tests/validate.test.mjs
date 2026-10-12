import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, symlink, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { contract, update, put, temporary } from './helpers.mjs';
import { validateContract, validateFeedback, sha256 } from '../scripts/lib/contract.mjs';

async function withContract(options, run) { const root = await contract(options); try { await run(root); } finally { await rm(root, { recursive: true, force: true }); } }
test('valid component, screen and multi-screen contracts', async () => {
  for (const options of [{}, { roots: ['1:1', '2:2'] }, { roots: ['1:1', '2:2'], unavailable: true }])
    await withContract(options, async root => assert.equal((await validateContract(root)).status, 'ready'));
});
test('missing approval coverage and unsupported schema version are invalid', async () => {
  await withContract({}, async root => {
    await update(root, 'scope.json', x => { x.approval.approvedRoots = ['9:9']; });
    assert.match((await validateContract(root)).errors.join(' '), /Approved roots/);
    await update(root, 'manifest.json', x => { x.schemaVersion = '2.0.0'; });
    assert.equal((await validateContract(root)).status, 'invalid');
  });
});
test('missing files, tampered hashes, broken references and alias cycles are invalid', async () => {
  await withContract({}, async root => {
    await rm(path.join(root, 'scope.json'));
    assert.match((await validateContract(root)).errors.join(' '), /scope.json/);
  });
  await withContract({}, async root => {
    await writeFile(path.join(root, 'scope.json'), '{}');
    assert.match((await validateContract(root)).errors.join(' '), /SHA-256 mismatch/);
  });
  await withContract({}, async root => {
    await update(root, 'frames/screen-1.json', x => { x.nodes[0].tokenIds = ['missing']; });
    assert.match((await validateContract(root)).errors.join(' '), /unknown token/);
  });
  await withContract({}, async root => {
    await update(root, 'design-system/tokens.json', x => { x.tokens[0].values.light = { aliasOf: 'color/background', evidence: x.tokens[0].evidence }; });
    assert.match((await validateContract(root)).errors.join(' '), /alias cycle/);
  });
});
test('false verified mapping is invalid', async () => withContract({}, async root => {
  await update(root, 'design-system/components.json', x => { x.components[0].mapping = { status: 'verified', importPath: '@ui/Button' }; });
  assert.match((await validateContract(root)).errors.join(' '), /verified mapping/);
}));
test('coverage and interaction cross-file references are checked', async () => {
  await withContract({ roots: ['1:1', '2:2'] }, async root => {
    await update(root, 'manifest.json', x => { x.coverage.pop(); });
    assert.match((await validateContract(root)).errors.join(' '), /root has no coverage/);
  });
  await withContract({}, async root => {
    await update(root, 'manifest.json', x => { x.coverage[0].mode = 'unknown'; });
    assert.match((await validateContract(root)).errors.join(' '), /undeclared mode/);
  });
  await withContract({}, async root => {
    await update(root, 'interactions.json', x => { x.interactions.push({ id: 'go', sourceNodeId: '1:1:child', targetNodeId: 'missing', kind: 'navigate', evidence: { status: 'confirmed', source: 'figma:prototype' } }); });
    assert.match((await validateContract(root)).errors.join(' '), /unknown target node/);
  });
});
test('path traversal, absolute path and symlink escape are rejected', async () => {
  for (const invalid of ['../escape', '/tmp/escape', 'C:\\escape']) await withContract({}, async root => {
    await update(root, 'manifest.json', x => { x.payload[0].path = invalid; });
    assert.equal((await validateContract(root)).status, 'invalid');
  });
  await withContract({}, async root => {
    await rm(path.join(root, 'scope.json'));
    await symlink('/etc/hosts', path.join(root, 'scope.json'));
    assert.match((await validateContract(root)).errors.join(' '), /Symlink/);
  });
});
test('design blockers have a distinct status', async () => withContract({}, async root => {
  await update(root, 'unresolved.json', x => { x.issues.push({ id: 'gap-1', severity: 'blocking', category: 'state', question: 'What is the error state?', affectedCoverageIds: ['coverage-1'] }); });
  const result = await validateContract(root);
  assert.equal(result.status, 'blocked');
  assert.match(result.blockers.join(' '), /gap-1/);
}));
test('feedback binds to contract hash and retains issue identity across revisions', async () => withContract({}, async root => {
  const result = await validateContract(root);
  const output = await temporary();
  try {
    await put(output, 'actual.png', Buffer.from('capture'));
    const issue = { id: 'visual-1', category: 'visual', severity: 'blocking', status: 'open', observed: 'wrong color',
      expected: 'Figma reference', question: 'Confirm token mapping', coverageIds: ['coverage-1'],
      artifacts: [{ path: 'actual.png', sha256: sha256(await readFile(path.join(output, 'actual.png'))) }] };
    const feedback = { schemaVersion: '1.0.0', contractId: result.contractId, revision: result.revision,
      manifestSha256: result.manifestSha256, iteration: 1, issues: [issue] };
    await put(output, 'feedback.json', feedback);
    assert.equal((await validateFeedback(path.join(output, 'feedback.json'), root)).status, 'ready');
    await put(output, 'previous.json', feedback);
    feedback.iteration = 2; feedback.issues[0].status = 'resolved';
    await put(output, 'feedback.json', feedback);
    assert.equal((await validateFeedback(path.join(output, 'feedback.json'), root, path.join(output, 'previous.json'))).status, 'ready');
    feedback.issues = [];
    await put(output, 'feedback.json', feedback);
    assert.match((await validateFeedback(path.join(output, 'feedback.json'), root, path.join(output, 'previous.json'))).errors.join(' '), /identity disappeared/);
    feedback.issues = [{ ...issue, coverageIds: ['missing-coverage'] }];
    await put(output, 'feedback.json', feedback);
    assert.match((await validateFeedback(path.join(output, 'feedback.json'), root)).errors.join(' '), /unknown coverage/);
    feedback.contractId = 'wrong'; await put(output, 'feedback.json', feedback);
    assert.match((await validateFeedback(path.join(output, 'feedback.json'), root)).errors.join(' '), /different contract/);
  } finally { await rm(output, { recursive: true, force: true }); }
}));
