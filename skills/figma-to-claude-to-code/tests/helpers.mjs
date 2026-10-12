import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { sha256 } from '../scripts/lib/contract.mjs';

export async function temporary() { return mkdtemp(path.join(os.tmpdir(), 'figma-skill-test-')); }
export async function put(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, typeof contents === 'string' || Buffer.isBuffer(contents) ? contents : JSON.stringify(contents, null, 2) + '\n');
}
export async function get(root, relative) { return JSON.parse(await readFile(path.join(root, relative), 'utf8')); }
export async function update(root, relative, change) { const data = await get(root, relative); change(data); await put(root, relative, data); await refresh(root); }
export async function refresh(root) {
  const manifest = await get(root, 'manifest.json');
  for (const entry of manifest.payload) {
    try { entry.sha256 = sha256(await readFile(path.join(root, entry.path))); } catch {}
  }
  await put(root, 'manifest.json', manifest);
}
export function png(width = 2, height = 2, color = [255, 255, 255, 255]) {
  const image = new PNG({ width, height });
  for (let p = 0; p < width * height; p++) image.data.set(color, p * 4);
  return PNG.sync.write(image);
}

export async function contract({ roots = ['1:1'], unavailable = false } = {}) {
  const root = await temporary();
  const evidence = { status: 'confirmed', source: 'figma:node' };
  const scope = {
    entryNodeId: roots[0], roots, dependencies: ['component:button'], exclusions: [],
    approval: { id: 'approval-1', recordedAt: '2026-10-12T10:00:00Z', provenance: 'synthetic test approval',
      approvedRoots: roots, approvedDependencies: ['component:button'], destination: path.join(root, 'private-contract') }
  };
  const components = { capability: 'available', components: [{ id: 'component:button', name: 'Button', evidence,
    mapping: { status: 'unverified' } }] };
  const tokens = { capability: 'available', modes: ['light', 'dark'], tokens: [
    { id: 'color/base', name: 'Base', type: 'color', values: {
      light: { value: '#ffffff', evidence }, dark: { value: '#000000', evidence } }, evidence },
    { id: 'color/background', name: 'Background', type: 'color', values: {
      light: { aliasOf: 'color/base', evidence }, dark: { aliasOf: 'color/base', evidence } }, evidence }
  ] };
  const manifest = {
    schemaVersion: '1.0.0', contractId: 'synthetic-contract', revision: 1, producer: 'claude-export',
    exportedAt: '2026-10-12T10:01:00Z',
    source: { figmaUrl: 'https://www.figma.com/design/TESTKEY/Synthetic?node-id=1-1', fileKey: 'TESTKEY', entryNodeId: roots[0],
      version: null, versionUnavailableReason: 'Fixture has no live Figma version' },
    approvalId: 'approval-1', coverage: [], payload: []
  };
  const add = async (relative, role, value) => {
    await put(root, relative, value);
    manifest.payload.push({ path: relative, role, sha256: sha256(await readFile(path.join(root, relative))) });
  };
  await add('scope.json', 'scope', scope);
  await add('design-system/components.json', 'components', components);
  await add('design-system/tokens.json', 'tokens', tokens);
  await add('interactions.json', 'interactions', { capability: 'unavailable', interactions: [] });
  await add('unresolved.json', 'unresolved', { issues: [] });
  for (let index = 0; index < roots.length; index++) {
    const rootId = roots[index], name = `screen-${index + 1}`;
    await add(`frames/${name}.json`, 'frame', { rootId, dimensions: { width: 2, height: 2 },
      dependencies: ['component:button'], evidence,
      nodes: [{ id: `${rootId}:child`, type: 'INSTANCE', name: 'Button', componentId: 'component:button',
        tokenIds: ['color/background'], layout: { width: 2, height: 2 }, evidence }] });
    if (unavailable && index === roots.length - 1) {
      manifest.coverage.push({ id: `coverage-${index + 1}`, rootId, state: 'error', mode: 'light',
        viewport: { width: 2, height: 2 }, status: 'unavailable', evidence: { status: 'missing', source: 'not present in fixture' } });
    } else {
      await add(`references/${name}.png`, 'reference', png());
      manifest.coverage.push({ id: `coverage-${index + 1}`, rootId, state: 'default', mode: 'light',
        viewport: { width: 2, height: 2 }, status: 'present', framePath: `frames/${name}.json`,
        referencePath: `references/${name}.png`, evidence });
    }
  }
  await put(root, 'manifest.json', manifest);
  return root;
}
