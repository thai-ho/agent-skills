#!/usr/bin/env node
import { readFile, writeFile, mkdir, lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const value = key => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
if (args.includes('--help')) {
  console.log('Usage: node visual-diff.mjs --reference figma.png --actual browser.png --out output-directory [--channel-tolerance 0..255] [--max-different-pixels N]');
  console.log('Defaults are strict: channel tolerance 0, maximum different pixels 0. Exit: 0 within threshold, 2 difference exceeds threshold, 1 invalid input/runtime error.');
  process.exit(0);
}
const reference = value('--reference'), actual = value('--actual'), out = value('--out');
const tolerance = Number(value('--channel-tolerance') ?? 0);
const maxDifferent = Number(value('--max-different-pixels') ?? 0);
if (!reference || !actual || !out || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255 ||
    !Number.isInteger(maxDifferent) || maxDifferent < 0 ||
    args.some(x => x.startsWith('--') && !['--reference', '--actual', '--out', '--channel-tolerance', '--max-different-pixels'].includes(x))) {
  console.error('Invalid arguments. Use --help for usage.'); process.exit(1);
}
try {
  const [refBytes, actualBytes] = await Promise.all([readFile(reference), readFile(actual)]);
  const ref = PNG.sync.read(refBytes), rendered = PNG.sync.read(actualBytes);
  if (ref.width !== rendered.width || ref.height !== rendered.height)
    throw new Error(`Dimension mismatch: reference ${ref.width}x${ref.height}, actual ${rendered.width}x${rendered.height}; no resize or crop was performed`);
  const diff = new PNG({ width: ref.width, height: ref.height });
  let differentPixels = 0, sumAbs = 0, sumSquares = 0, maxChannelDelta = 0;
  for (let p = 0; p < ref.width * ref.height; p++) {
    const offset = p * 4;
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(ref.data[offset + channel] - rendered.data[offset + channel]);
      sumAbs += delta; sumSquares += delta * delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > tolerance) changed = true;
    }
    if (changed) differentPixels++;
    diff.data[offset] = changed ? 255 : Math.round(ref.data[offset] * 0.3);
    diff.data[offset + 1] = changed ? 0 : Math.round(ref.data[offset + 1] * 0.3);
    diff.data[offset + 2] = changed ? 0 : Math.round(ref.data[offset + 2] * 0.3);
    diff.data[offset + 3] = 255;
  }
  const totalChannels = ref.width * ref.height * 4;
  const report = {
    status: differentPixels <= maxDifferent ? 'pass' : 'difference',
    reference: path.resolve(reference), actual: path.resolve(actual),
    dimensions: { width: ref.width, height: ref.height },
    settings: { channelTolerance: tolerance, maxDifferentPixels: maxDifferent, alignment: 'none', masks: [] },
    metrics: { differentPixels, totalPixels: ref.width * ref.height, differentPercent: 100 * differentPixels / (ref.width * ref.height),
      meanAbsoluteChannelDifference: sumAbs / totalChannels, rootMeanSquareChannelDifference: Math.sqrt(sumSquares / totalChannels), maxChannelDelta }
  };
  const diffPath = path.resolve(out, 'diff.png'), reportPath = path.resolve(out, 'report.json');
  if ([path.resolve(reference), path.resolve(actual)].includes(diffPath) || [path.resolve(reference), path.resolve(actual)].includes(reportPath))
    throw new Error('Output would overwrite an input image');
  await mkdir(out, { recursive: true });
  const inputPaths = await Promise.all([realpath(reference), realpath(actual)]);
  const inputStats = await Promise.all([stat(reference), stat(actual)]);
  for (const target of [diffPath, reportPath]) {
    try {
      const targetInfo = await lstat(target);
      if (targetInfo.isSymbolicLink()) throw new Error(`Output file is a symlink: ${target}`);
      const resolved = await realpath(target);
      if (inputPaths.includes(resolved) || inputStats.some(x => x.dev === targetInfo.dev && x.ino === targetInfo.ino))
        throw new Error(`Output would overwrite an input image: ${target}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(diffPath, PNG.sync.write(diff));
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'pass' ? 0 : 2);
} catch (error) {
  console.error(`Visual diff failed: ${error.message}`); process.exit(1);
}
