import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm, mkdir, writeFile, link, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { temporary, png, contract } from './helpers.mjs';

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = name => path.join(skill, 'scripts', `${name}.mjs`);
const run = (name, args) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8' });

test('visual diff passes identical PNGs, flags changed region, rejects dimensions', async () => {
  const dir = await temporary();
  try {
    const reference = path.join(dir, 'reference.png'), actual = path.join(dir, 'actual.png'), out = path.join(dir, 'output');
    await writeFile(reference, png()); await writeFile(actual, png());
    assert.equal(run('visual-diff', ['--reference', reference, '--actual', actual, '--out', out]).status, 0);
    await writeFile(actual, png(2, 2, [0, 0, 0, 255]));
    assert.equal(run('visual-diff', ['--reference', reference, '--actual', actual, '--out', out]).status, 2);
    const report = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'));
    assert.equal(report.metrics.differentPixels, 4);
    assert.equal(report.settings.maxDifferentPixels, 0);
    await writeFile(actual, png(3, 2));
    const mismatch = run('visual-diff', ['--reference', reference, '--actual', actual, '--out', out]);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /Dimension mismatch/);
    await writeFile(actual, png());
    await rm(path.join(out, 'diff.png'));
    await link(reference, path.join(out, 'diff.png'));
    const hardlink = run('visual-diff', ['--reference', reference, '--actual', actual, '--out', out]);
    assert.equal(hardlink.status, 1);
    assert.match(hardlink.stderr, /overwrite an input/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('installer dry-run, repeat, conflict and installed dependencies', async () => {
  const dir = await temporary();
  try {
    const args = ['--agent', 'both', '--scope', 'project', '--project', dir];
    assert.equal(run('install', [...args, '--dry-run']).status, 0);
    const destination = path.join(dir, '.agents', 'skills', 'figma-to-claude-to-code');
    await assert.rejects(readFile(path.join(destination, 'SKILL.md')));
    const first = run('install', args);
    assert.equal(first.status, 0, first.stderr);
    const second = run('install', args);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /current:/);
    assert.ok((await readFile(path.join(destination, 'schemas', 'manifest.schema.json'))).length > 0);
    const fixture = await contract();
    try {
      const installed = spawnSync(process.execPath, [path.join(destination, 'scripts', 'validate.mjs'), fixture], { encoding: 'utf8' });
      assert.equal(installed.status, 0, installed.stderr + installed.stdout);
    } finally { await rm(fixture, { recursive: true, force: true }); }
    await writeFile(path.join(destination, 'SKILL.md'), 'local edit');
    assert.equal(run('install', args).status, 2);
    assert.equal(run('install', [...args, '--overwrite']).status, 0);
    assert.match(await readFile(path.join(destination, 'SKILL.md'), 'utf8'), /^---/);
    const unrelated = path.join(dir, '.claude', 'skills', 'figma-to-claude-to-code');
    await rm(unrelated, { recursive: true }); await mkdir(unrelated, { recursive: true });
    await writeFile(path.join(unrelated, 'SKILL.md'), 'unrelated');
    assert.equal(run('install', [...args, '--overwrite']).status, 2);
    await rm(unrelated, { recursive: true });
    await symlink(destination, unrelated);
    assert.equal(run('install', [...args, '--overwrite']).status, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('doctor leaves live Figma and authentication unverified', () => {
  const result = run('doctor', []);
  assert.match(result.stdout, /UNVERIFIED: Figma MCP access/);
  assert.match(result.stdout, /UNVERIFIED: Agent authentication/);
  assert.doesNotMatch(result.stdout, /PASS: Figma MCP access/);
});
