// Compares the old MongoDB history with what was imported, record by record. Exits non-zero on
// any difference.
//
//   npx tsx legacy/reconcile-mongo.ts --owner <username> [--remote]
import { parseArgs, connect, mongoUri } from './cli.ts';
import { describeReconcile, reconcileLegacy } from './reconcile.ts';
import { loadMongoSource } from './source.ts';

const args = parseArgs(process.argv.slice(2), ['--owner']);
const owner = args.options.get('--owner');
if (!owner) {
  console.error('Usage: tsx legacy/reconcile-mongo.ts --owner <username> [--remote]');
  process.exit(2);
}

const sql = connect(args);
try {
  const source = await loadMongoSource(mongoUri());
  const report = await reconcileLegacy(source, sql, owner);
  console.log(describeReconcile(report));
  if (!report.ok) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
