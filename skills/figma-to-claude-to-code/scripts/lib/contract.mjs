import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PNG } from 'pngjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaNames = ['common', 'manifest', 'scope', 'frame', 'components', 'tokens', 'interactions', 'unresolved', 'feedback'];
const schemaRole = { scope: 'scope', frame: 'frame', components: 'components', tokens: 'tokens', interactions: 'interactions', unresolved: 'unresolved' };
const fixedRoles = {
  'scope.json': 'scope',
  'design-system/components.json': 'components',
  'design-system/tokens.json': 'tokens',
  'interactions.json': 'interactions',
  'unresolved.json': 'unresolved'
};

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 &&
    !value.startsWith('/') && !value.includes('\\') && !value.includes(':') &&
    !/[\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

async function safeRead(root, relative) {
  if (!safeRelative(relative)) throw new Error(`Unsafe relative path: ${relative}`);
  const absoluteRoot = await realpath(root);
  let current = absoluteRoot;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`);
  }
  const resolved = await realpath(current);
  if (!resolved.startsWith(absoluteRoot + path.sep)) throw new Error(`Path escapes package: ${relative}`);
  return readFile(resolved);
}

async function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of schemaNames) {
    const schema = JSON.parse(await readFile(path.join(skillRoot, 'schemas', `${name}.schema.json`), 'utf8'));
    ajv.addSchema(schema);
  }
  return Object.fromEntries(schemaNames.slice(1).map(name => [name, ajv.getSchema(`https://thai-ho.github.io/agent-skills/schemas/${name}.schema.json`)]));
}

function schemaCheck(validate, data, label, errors) {
  if (!validate(data)) for (const error of validate.errors ?? []) errors.push(`${label}${error.instancePath}: ${error.message}`);
}

function uniqueIds(items, label, errors) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`Duplicate ${label} ID: ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function inspectNodes(nodes, visit) {
  for (const node of nodes) { visit(node); inspectNodes(node.children ?? [], visit); }
}

export async function validateContract(root) {
  const errors = [], blockers = [], warnings = [];
  const result = { status: 'invalid', errors, blockers, warnings };
  let manifest;
  try { manifest = JSON.parse(await safeRead(root, 'manifest.json')); }
  catch (error) { errors.push(`manifest.json: ${error.message}`); return result; }
  const v = await validators();
  schemaCheck(v.manifest, manifest, 'manifest.json', errors);
  if (errors.length) return result;
  if (manifest.source.version === null && !manifest.source.versionUnavailableReason)
    errors.push('source.versionUnavailableReason is required when source.version is null');
  try {
    const parsed = new URL(manifest.source.figmaUrl);
    if (!['www.figma.com', 'figma.com'].includes(parsed.hostname) ||
        !parsed.pathname.split('/').includes(manifest.source.fileKey))
      errors.push('source.figmaUrl must identify the declared Figma file key');
  } catch { errors.push('source.figmaUrl is invalid'); }
  const payload = new Map();
  for (const entry of manifest.payload) {
    if (!safeRelative(entry.path) || entry.path === 'manifest.json') { errors.push(`Unsafe payload path: ${entry.path}`); continue; }
    if (payload.has(entry.path)) errors.push(`Duplicate payload path: ${entry.path}`);
    payload.set(entry.path, entry);
    if (fixedRoles[entry.path] && fixedRoles[entry.path] !== entry.role)
      errors.push(`Wrong role for ${entry.path}: expected ${fixedRoles[entry.path]}`);
    if (entry.role === 'frame' && !/^frames\/[^/]+\.json$/.test(entry.path)) errors.push(`Invalid frame path: ${entry.path}`);
    if (entry.role === 'reference' && !/^references\/[^/]+\.png$/.test(entry.path)) errors.push(`Invalid reference path: ${entry.path}`);
    if (entry.role === 'asset' && !entry.path.startsWith('assets/')) errors.push(`Invalid asset path: ${entry.path}`);
    if (entry.role === 'evidence' && !entry.path.startsWith('evidence/')) errors.push(`Invalid evidence path: ${entry.path}`);
  }
  for (const [required, role] of Object.entries(fixedRoles))
    if (payload.get(required)?.role !== role) errors.push(`Required payload is missing: ${required}`);
  if (!manifest.payload.some(x => x.role === 'frame')) errors.push('At least one frame payload is required');
  const documents = new Map(), imageDimensions = new Map();
  for (const entry of manifest.payload) {
    if (!safeRelative(entry.path)) continue;
    try {
      const bytes = await safeRead(root, entry.path);
      if (sha256(bytes) !== entry.sha256) errors.push(`SHA-256 mismatch: ${entry.path}`);
      if (entry.role === 'reference') {
        try { const image = PNG.sync.read(bytes); imageDimensions.set(entry.path, { width: image.width, height: image.height }); }
        catch (error) { errors.push(`Invalid PNG reference ${entry.path}: ${error.message}`); }
      }
      if (schemaRole[entry.role]) {
        const document = JSON.parse(bytes);
        documents.set(entry.path, document);
        schemaCheck(v[schemaRole[entry.role]], document, entry.path, errors);
      }
    } catch (error) { errors.push(`${entry.path}: ${error.message}`); }
  }
  if (errors.length) return result;
  const scope = documents.get('scope.json');
  const components = documents.get('design-system/components.json');
  const tokens = documents.get('design-system/tokens.json');
  const interactions = documents.get('interactions.json');
  const unresolved = documents.get('unresolved.json');
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  if (manifest.source.entryNodeId !== scope.entryNodeId) errors.push('Manifest entry node differs from scope entry node');
  if (manifest.approvalId !== scope.approval.id) errors.push('Approval ID does not link to scope');
  if (!same(scope.roots, scope.approval.approvedRoots)) errors.push('Approved roots do not match exported roots');
  if (!same(scope.dependencies, scope.approval.approvedDependencies ?? [])) errors.push('Approved dependencies do not match exported dependencies');
  if (scope.roots.some(x => scope.exclusions.includes(x))) errors.push('Excluded node is also an approved root');
  const rootIds = new Set(scope.roots);
  const coverageIds = uniqueIds(manifest.coverage, 'coverage', errors);
  const coverageKeys = new Set();
  for (const coverage of manifest.coverage) {
    const key = JSON.stringify([coverage.rootId, coverage.state, coverage.mode, coverage.viewport]);
    if (coverageKeys.has(key)) errors.push(`Duplicate coverage combination: ${coverage.id}`);
    coverageKeys.add(key);
  }
  const issueIds = uniqueIds(unresolved.issues, 'unresolved issue', errors);
  for (const issue of unresolved.issues) {
    for (const id of issue.affectedCoverageIds)
      if (!coverageIds.has(id)) errors.push(`Unresolved issue ${issue.id} references unknown coverage ${id}`);
    if (issue.severity === 'blocking') blockers.push(`${issue.id}: ${issue.question}`);
  }
  const componentIds = uniqueIds(components.components, 'component', errors);
  const tokenIds = uniqueIds(tokens.tokens, 'token', errors);
  const frameRoots = new Set(), nodeIds = new Set();
  for (const [framePath, frame] of documents) {
    if (payload.get(framePath)?.role !== 'frame') continue;
    if (!rootIds.has(frame.rootId)) errors.push(`${framePath}: root is outside approved scope`);
    frameRoots.add(frame.rootId);
    for (const dependency of frame.dependencies)
      if (!scope.dependencies.includes(dependency)) errors.push(`${framePath}: unapproved dependency ${dependency}`);
    inspectNodes(frame.nodes, node => {
      if (nodeIds.has(node.id)) errors.push(`Duplicate node ID: ${node.id}`);
      nodeIds.add(node.id);
      if (node.componentId && !componentIds.has(node.componentId)) errors.push(`${node.id}: unknown component ${node.componentId}`);
      for (const tokenId of node.tokenIds ?? []) if (!tokenIds.has(tokenId)) errors.push(`${node.id}: unknown token ${tokenId}`);
      for (const assetPath of node.assetPaths ?? []) if (payload.get(assetPath)?.role !== 'asset') errors.push(`${node.id}: unlisted asset ${assetPath}`);
    });
  }
  for (const rootId of rootIds) if (!frameRoots.has(rootId)) errors.push(`Approved root has no frame: ${rootId}`);
  for (const rootId of rootIds) if (!manifest.coverage.some(x => x.rootId === rootId)) errors.push(`Approved root has no coverage: ${rootId}`);
  for (const issue of unresolved.issues) for (const id of issue.affectedNodeIds ?? [])
    if (!nodeIds.has(id)) errors.push(`Unresolved issue ${issue.id} references unknown node ${id}`);
  for (const coverage of manifest.coverage) {
    if (!rootIds.has(coverage.rootId)) errors.push(`Coverage ${coverage.id} is outside approved roots`);
    if (tokens.capability === 'available' && !tokens.modes.includes(coverage.mode)) errors.push(`Coverage ${coverage.id} uses undeclared mode ${coverage.mode}`);
    if (coverage.status === 'present') {
      if (payload.get(coverage.framePath)?.role !== 'frame') errors.push(`Coverage ${coverage.id} has no listed frame`);
      else if (documents.get(coverage.framePath)?.rootId !== coverage.rootId) errors.push(`Coverage ${coverage.id} frame root mismatch`);
      if (payload.get(coverage.referencePath)?.role !== 'reference') errors.push(`Coverage ${coverage.id} has no listed PNG reference`);
      const dimensions = imageDimensions.get(coverage.referencePath);
      if (dimensions && (dimensions.width !== coverage.viewport.width || dimensions.height !== coverage.viewport.height))
        errors.push(`Coverage ${coverage.id} reference PNG dimensions differ from declared viewport`);
      if (coverage.evidence.status !== 'confirmed') blockers.push(`Coverage ${coverage.id} is present without confirmed evidence`);
    } else {
      if (coverage.framePath || coverage.referencePath) errors.push(`Coverage ${coverage.id} is ${coverage.status} but names present files`);
      if (coverage.status === 'unresolved' && !unresolved.issues.some(i => i.affectedCoverageIds.includes(coverage.id)))
        errors.push(`Unresolved coverage ${coverage.id} has no issue`);
      if (coverage.status === 'unavailable') warnings.push(`Coverage ${coverage.id} explicitly unavailable`);
      if (coverage.status === 'unresolved') blockers.push(`Coverage ${coverage.id} unresolved`);
    }
  }
  for (const component of components.components) {
    const mapping = component.mapping;
    if (mapping?.status === 'verified' && (!mapping.importPath || !mapping.usage || mapping.evidence?.status !== 'confirmed'))
      errors.push(`Component ${component.id} claims verified mapping without confirmed import, usage and evidence`);
  }
  for (const token of tokens.tokens) {
    for (const [mode, value] of Object.entries(token.values)) {
      if (!tokens.modes.includes(mode)) errors.push(`Token ${token.id} uses undeclared mode ${mode}`);
      if (value.aliasOf && value.value !== undefined) errors.push(`Token ${token.id}/${mode} cannot have both alias and value`);
      if (!value.aliasOf && value.value === undefined && value.evidence.status === 'confirmed') errors.push(`Confirmed token ${token.id}/${mode} has no value`);
    }
  }
  const tokenMap = new Map(tokens.tokens.map(t => [t.id, t]));
  for (const token of tokens.tokens) for (const mode of Object.keys(token.values)) {
    const visited = new Set(); let current = token;
    while (current?.values[mode]?.aliasOf) {
      if (visited.has(current.id)) { errors.push(`Token alias cycle at ${token.id}/${mode}`); break; }
      visited.add(current.id);
      const nextId = current.values[mode].aliasOf;
      current = tokenMap.get(nextId);
      if (!current || !current.values[mode]) { errors.push(`Token ${token.id}/${mode} aliases missing target ${nextId}/${mode}`); break; }
    }
  }
  uniqueIds(interactions.interactions, 'interaction', errors);
  for (const interaction of interactions.interactions) {
    if (!nodeIds.has(interaction.sourceNodeId)) errors.push(`Interaction ${interaction.id} references unknown source node`);
    if (interaction.targetNodeId && !nodeIds.has(interaction.targetNodeId) && !scope.dependencies.includes(interaction.targetNodeId))
      errors.push(`Interaction ${interaction.id} references unknown target node`);
  }
  if (errors.length) return result;
  result.status = blockers.length ? 'blocked' : 'ready';
  result.contractId = manifest.contractId;
  result.revision = manifest.revision;
  result.manifestSha256 = sha256(await safeRead(root, 'manifest.json'));
  return result;
}

export async function validateFeedback(feedbackPath, contractRoot, previousFeedbackPath) {
  const errors = [];
  const result = { status: 'invalid', errors };
  const contract = await validateContract(contractRoot);
  if (contract.status === 'invalid') { errors.push('Referenced contract is invalid', ...contract.errors); return result; }
  let feedback;
  try { feedback = JSON.parse(await readFile(feedbackPath)); }
  catch (error) { errors.push(`Feedback: ${error.message}`); return result; }
  const v = await validators();
  schemaCheck(v.feedback, feedback, 'feedback', errors);
  if (errors.length) return result;
  if (feedback.contractId !== contract.contractId || feedback.revision !== contract.revision || feedback.manifestSha256 !== contract.manifestSha256)
    errors.push('Feedback references a different contract ID, revision or manifest hash');
  uniqueIds(feedback.issues, 'feedback issue', errors);
  const manifest = JSON.parse(await safeRead(contractRoot, 'manifest.json'));
  const coverageIds = new Set(manifest.coverage.map(x => x.id));
  const nodeIds = new Set();
  for (const entry of manifest.payload.filter(x => x.role === 'frame')) {
    const frame = JSON.parse(await safeRead(contractRoot, entry.path));
    inspectNodes(frame.nodes, node => nodeIds.add(node.id));
  }
  for (const issue of feedback.issues) {
    for (const id of issue.coverageIds ?? []) if (!coverageIds.has(id)) errors.push(`Feedback issue ${issue.id} references unknown coverage ${id}`);
    for (const id of issue.nodeIds ?? []) if (!nodeIds.has(id)) errors.push(`Feedback issue ${issue.id} references unknown node ${id}`);
  }
  let previous;
  if (previousFeedbackPath) {
    try { previous = JSON.parse(await readFile(previousFeedbackPath)); schemaCheck(v.feedback, previous, 'previous feedback', errors); }
    catch (error) { errors.push(`Previous feedback: ${error.message}`); }
    if (previous && feedback.contractId !== previous.contractId) errors.push('Previous feedback belongs to a different contract');
    if (previous && feedback.iteration <= previous.iteration) errors.push('Feedback iteration must increase');
    if (previous && feedback.revision < previous.revision) errors.push('Feedback revision must not decrease');
    if (previous) for (const issue of previous.issues)
      if (!feedback.issues.some(x => x.id === issue.id)) errors.push(`Previous issue identity disappeared: ${issue.id}`);
  }
  const outputRoot = path.dirname(feedbackPath);
  for (const issue of feedback.issues) for (const artifact of issue.artifacts ?? []) {
    try {
      const bytes = await safeRead(outputRoot, artifact.path);
      if (sha256(bytes) !== artifact.sha256) errors.push(`Feedback artifact hash mismatch: ${artifact.path}`);
    } catch (error) { errors.push(`Feedback artifact ${artifact.path}: ${error.message}`); }
  }
  result.status = errors.length ? 'invalid' : 'ready';
  return result;
}
