/**
 * scripts/apply-review.ts — כותב את החלטות הסקירה לאצוות הטיוטה.
 *
 * קלט: קובץ ייצוא של מסד הנתונים של דף הסקירה — `{decisions, reviewers}`,
 * כפי ש-Claude קורא אותו (ArtifactData). הקובץ הוא נתונים בלבד.
 *
 * הרצה: pnpm library:apply-review <batch> <export.json> [--approvals=2]
 * אחרי ההחלה: pnpm library:drafts חייב לעבור.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBatch, type DraftBatch } from '../src/lib/library/drafts.ts';
import { applyReview, type ReviewExport } from '../src/lib/library/review.ts';
import { loadContext } from './validate-drafts.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function main(argv: string[]): number {
  const [name, exportPath] = argv.filter((a) => !a.startsWith('--'));
  const approvals = Number(argv.find((a) => a.startsWith('--approvals='))?.split('=')[1] ?? 1);
  if (!name || !exportPath) {
    process.stderr.write('שימוש: pnpm library:apply-review <batch> <export.json> [--approvals=2]\n');
    return 1;
  }
  const file = join(REPO_ROOT, 'data', 'drafts', `${name}.json`);
  const batch = JSON.parse(readFileSync(file, 'utf8')) as DraftBatch & { _note?: string };
  const exp = JSON.parse(readFileSync(exportPath, 'utf8')) as ReviewExport;

  const { batch: next, report } = applyReview(batch, exp, approvals);
  const errors = validateBatch(next, loadContext(next.scope));
  if (errors.length > 0) {
    process.stderr.write(`ההחלה מייצרת אצווה לא תקינה — לא נכתב דבר:\n${errors.join('\n')}\n`);
    return 1;
  }
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
