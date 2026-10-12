#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { markerName, skillName, sourceHash } from './lib/install-utils.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = key => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
if (args.includes('--help')) {
  console.log('Usage: node install.mjs --agent claude|codex|both --scope user|project [--project /path/to/project] [--dry-run] [--overwrite]');
  console.log('Requires Node >=22 and pnpm 11. Exit: 0 success, 1 invalid arguments/runtime, 2 destination conflict.');
  process.exit(0);
}
const agent = option('--agent'), scope = option('--scope');
const project = option('--project');
if (!['claude', 'codex', 'both'].includes(agent) || !['user', 'project'].includes(scope) ||
    (scope === 'project' && !project) || (scope === 'user' && project) ||
    args.some(x => x.startsWith('--') && !['--agent', '--scope', '--project', '--dry-run', '--overwrite'].includes(x))) {
  console.error('Invalid arguments. Use --help for usage.'); process.exit(1);
}
const base = scope === 'user' ? os.homedir() : path.resolve(project);
const destinations = [
  ...(agent === 'claude' || agent === 'both' ? [path.join(base, '.claude', 'skills', skillName)] : []),
  ...(agent === 'codex' || agent === 'both' ? [path.join(base, '.agents', 'skills', skillName)] : [])
];
const exists = async target => { try { await lstat(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmOptions = { shell: process.platform === 'win32' };
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required');
  if (scope === 'project' && !(await lstat(base)).isDirectory()) throw new Error('Project path must be an existing directory');
  const hash = await sourceHash(source);
  const actions = [];
  for (const destination of destinations) {
    if (!(await exists(destination))) { actions.push({ destination, action: 'install' }); continue; }
    if ((await lstat(destination)).isSymbolicLink()) { console.error(`Symlink destination is not supported: ${destination}`); process.exit(2); }
    let marker;
    try { marker = JSON.parse(await readFile(path.join(destination, markerName), 'utf8')); } catch {}
    if (marker?.skill !== skillName) { console.error(`Unrelated destination exists: ${destination}`); process.exit(2); }
    const currentHash = await sourceHash(destination);
    if (marker.sourceHash === hash && currentHash === hash) actions.push({ destination, action: 'current' });
    else if (args.includes('--overwrite')) actions.push({ destination, action: 'replace' });
    else { console.error(`Installed skill differs: ${destination}. Use --overwrite to replace this managed installation.`); process.exit(2); }
  }
  for (const { destination, action } of actions) console.log(`${action}: ${destination}`);
  if (args.includes('--dry-run')) process.exit(0);
  if (actions.some(x => x.action !== 'current')) {
    const version = spawnSync(pnpmCommand, ['--version'], { encoding: 'utf8', ...pnpmOptions });
    if (version.status !== 0 || Number(version.stdout.trim().split('.')[0]) !== 11)
      throw new Error('pnpm 11 is required for portable runtime dependency installation');
  }
  for (const { destination, action } of actions) {
    if (action === 'current') continue;
    await mkdir(path.dirname(destination), { recursive: true });
    const staging = `${destination}.staging-${process.pid}`;
    const backup = `${destination}.backup-${process.pid}`;
    try {
      await cp(source, staging, { recursive: true, filter: src => !['node_modules', markerName, '.DS_Store'].includes(path.basename(src)) });
      const install = spawnSync(pnpmCommand, ['install', '--prod', '--frozen-lockfile'], { cwd: staging, stdio: 'inherit', ...pnpmOptions });
      if (install.status !== 0) throw new Error(`Dependency install failed for ${destination}`);
      await writeFile(path.join(staging, markerName), JSON.stringify({ skill: skillName, sourceHash: hash }, null, 2) + '\n');
      if (action === 'replace') await rename(destination, backup);
      try { await rename(staging, destination); }
      catch (error) { if (action === 'replace') await rename(backup, destination); throw error; }
      if (action === 'replace') await rm(backup, { recursive: true, force: true });
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
} catch (error) { console.error(`Install failed: ${error.message}`); process.exit(1); }
