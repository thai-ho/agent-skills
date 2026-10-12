import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const skillName = 'figma-to-claude-to-code';
export const markerName = '.figma-to-claude-to-code-install.json';
export async function sourceHash(root) {
  const hash = createHash('sha256');
  async function visit(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', markerName, '.DS_Store'].includes(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Source contains symlink: ${relative}`);
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), relative);
      else if (entry.isFile()) { hash.update(relative + '\0'); hash.update(await readFile(path.join(dir, entry.name))); }
    }
  }
  await visit(root);
  return hash.digest('hex');
}
