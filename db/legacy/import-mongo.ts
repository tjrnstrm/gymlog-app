// Imports the old MongoDB workout history into Postgres, for ONE named user.
//
//   npx tsx legacy/import-mongo.ts --owner <username>                  dry run (default, writes nothing)
//   npx tsx legacy/import-mongo.ts --owner <username> --apply          write
//   npx tsx legacy/import-mongo.ts --owner <username> --apply --skip-invalid
//                                                                       also import the valid workouts when others are invalid
//   add --remote to target the database in DATABASE_URL instead of the local Supabase stack
//
// MongoDB is only read. The local database is the default target. See docs/mongo-reconciliation.md.
import { parseArgs, connect, mongoUri } from './cli.ts';
import { describeReport, importLegacy } from './import.ts';
import { loadMongoSource } from './source.ts';

const args = parseArgs(process.argv.slice(2), ['--owner']);
const owner = args.options.get('--owner');
if (!owner) {
  console.error('Usage: tsx legacy/import-mongo.ts --owner <username> [--apply] [--skip-invalid] [--remote]');
  process.exit(2);
}

const sql = connect(args);
try {
  const source = await loadMongoSource(mongoUri());
  console.log(`Read ${source.profiles.length} profile(s), ${source.exercises.length} exercise(s), ${source.workouts.length} workout(s) from ${source.sourceId}`);
  const report = await importLegacy(source, sql, owner, {
    apply: args.flags.has('--apply'),
    allowSkipInvalid: args.flags.has('--skip-invalid'),
    log: console.log,
  });
  console.log(`\n${describeReport(report)}`);
  if (!report.ok) {
    console.error('\nUnresolved errors. Nothing was imported that was affected by them.');
    process.exitCode = 1;
  } else if (!args.flags.has('--apply')) {
    console.log('\nDry run only. Re-run with --apply to import.');
  }
} finally {
  await sql.end({ timeout: 2 });
}
