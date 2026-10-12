#!/usr/bin/env node
import { validateContract, validateFeedback } from './lib/contract.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log('Usage: node validate.mjs <contract-directory> [--feedback <feedback.json> [--previous-feedback <feedback.json>]]');
  console.log('Exit codes: 0 ready, 2 valid with design blockers, 3 invalid package or feedback, 1 usage/runtime error.');
  process.exit(args.includes('--help') ? 0 : 1);
}
const root = args[0];
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
if (args.some((x, i) => x.startsWith('--') && !['--feedback', '--previous-feedback'].includes(x)) ||
    (args.includes('--feedback') && !option('--feedback')) ||
    (args.includes('--previous-feedback') && !option('--previous-feedback')) ||
    (args.includes('--previous-feedback') && !args.includes('--feedback'))) {
  console.error('Invalid options. Use --help for usage.'); process.exit(1);
}
try {
  const result = option('--feedback')
    ? await validateFeedback(option('--feedback'), root, option('--previous-feedback'))
    : await validateContract(root);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'ready' ? 0 : result.status === 'blocked' ? 2 : 3);
} catch (error) {
  console.error(`Validation failed: ${error.message}`); process.exit(1);
}
