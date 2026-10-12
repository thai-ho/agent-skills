#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { markerName, skillName, sourceHash } from './lib/install-utils.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node doctor.mjs [--project /path/to/frontend]');
  console.log('Reports only locally observable state. Exit: 0 no local failures, 1 local failure or invalid arguments.'); process.exit(0);
}
const at = args.indexOf('--project');
if (args.some(x => x.startsWith('--') && x !== '--project') || (at >= 0 && !args[at + 1])) {
  console.error('Invalid arguments. Use --help for usage.'); process.exit(1);
}
const project = at < 0 ? null : path.resolve(args[at + 1]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, status, detail) => checks.push({ name, status, detail });
const command = name => spawnSync(process.platform === 'win32' ? `${name}.cmd` : name, ['--version'],
  { encoding: 'utf8', shell: process.platform === 'win32' });
const present = async target => { try { await access(target); return true; } catch { return false; } };
add('Node runtime', Number(process.versions.node.split('.')[0]) >= 22 ? 'pass' : 'fail', process.version);
for (const name of ['pnpm', 'claude', 'codex']) {
  const result = command(name);
  const supported = name !== 'pnpm' || Number(result.stdout?.trim().split('.')[0]) === 11;
  add(`${name} executable`, result.status === 0 && supported ? 'pass' : name === 'pnpm' ? 'fail' : 'warning',
    result.status === 0 ? `${(result.stdout || result.stderr).trim().split('\n')[0]}${supported ? '' : '; pnpm 11 required'}` :
      'not found; executable presence does not prove an authenticated session');
}
for (const name of ['ajv', 'pngjs']) {
  try { await import(name); add(`${name} dependency`, 'pass', 'resolvable from skill directory'); }
  catch { add(`${name} dependency`, 'fail', 'Run pnpm install in the skill directory'); }
}
for (const [agent, target] of [
  ['Claude', path.join(os.homedir(), '.claude', 'skills', skillName)],
  ['Codex', path.join(os.homedir(), '.agents', 'skills', skillName)]
]) {
  if (!(await present(target))) { add(`${agent} user installation`, 'not applicable', 'not installed at user scope'); continue; }
  try {
    const marker = JSON.parse(await readFile(path.join(target, markerName), 'utf8'));
    const expected = await sourceHash(root), actual = await sourceHash(target);
    add(`${agent} user installation`, marker.skill === skillName && marker.sourceHash === expected && actual === expected ? 'pass' : 'warning',
      'Managed installation compared with this checkout');
  } catch { add(`${agent} user installation`, 'warning', 'Existing directory is not a verified managed installation'); }
}
add('Figma MCP access', 'unverified', 'Verify inside an authorized Claude session');
add('Agent authentication', 'unverified', 'Executable checks cannot establish session access');
if (!project) add('Project visual tooling', 'not applicable', 'Pass --project to inspect a frontend project');
else {
  try {
    const pkg = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    add('Project visual tooling', dependencies['@playwright/test'] || dependencies.playwright ? 'pass' : 'warning',
      dependencies['@playwright/test'] || dependencies.playwright ? 'Playwright declared; browser install and screenshot readiness remain unverified' : 'Playwright not declared');
  } catch { add('Project visual tooling', 'warning', 'No readable package.json'); }
}
for (const check of checks) console.log(`${check.status.toUpperCase()}: ${check.name} — ${check.detail}`);
process.exit(checks.some(x => x.status === 'fail') ? 1 : 0);
