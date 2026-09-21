/**
 * scripts/build-review-page.ts — מחולל את דף הסקירה של אצוות טיוטה (S1.5).
 *
 * הדף מתפרסם כ-Artifact פרטי. ההחלטות נשמרות במסד הנתונים של הדף,
 * ונקראות חזרה ל-data/drafts/ דרך apply-review. ראה docs/28-LIBRARY-REVIEW.md.
 *
 * הרצה: pnpm library:review <batch>    ← build/review/<batch>.html
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DraftBatch } from '../src/lib/library/drafts.ts';
import type { VerifiedItem, Verification } from '../src/lib/library/verification.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(REPO_ROOT, 'scripts', 'review-page', 'template.html');
const PLACEHOLDER = '/*__BATCH__*/';

/**
 * JSON בתוך תגית script: `<` מקודד, כדי שטקסט כמו `</script>` בתוך נוסח
 * לא יסגור את התגית. ה-JSON נשאר תקין ו-JSON.parse מחזיר אותו כמו שהוא.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** תוצאות האימות האחרונות לסעיפי האצווה, אם יש. */
export function latestVerification(batch: DraftBatch): { verified_on: string; items: Record<string, VerifiedItem> } | null {
  const dir = join(REPO_ROOT, 'data', 'verification');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const ids = new Set(batch.items.map((i) => i.id));
  for (const f of files.reverse()) {
    const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Verification;
    const mine = v.items.filter((i) => ids.has(i.id));
    if (mine.length > 0) return { verified_on: v.verified_on, items: Object.fromEntries(mine.map((i) => [i.id, i])) };
  }
  return null;
}

export function renderReviewPage(
  batch: DraftBatch,
  template: string = readFileSync(TEMPLATE, 'utf8'),
  verification: ReturnType<typeof latestVerification> = null,
): string {
  if (!template.includes(PLACEHOLDER)) throw new Error('בתבנית חסר מקום לנתוני האצווה');
  const data = verification ? { ...batch, verification } : batch;
  return template.replace(PLACEHOLDER, () => embedJson(data));
}

function main(argv: string[]): number {
  const name = argv[0];
  if (!name) {
    process.stderr.write('שימוש: pnpm library:review <batch>\n');
    return 1;
  }
  const batch = JSON.parse(readFileSync(join(REPO_ROOT, 'data', 'drafts', `${name}.json`), 'utf8')) as DraftBatch;
  const out = join(REPO_ROOT, 'build', 'review', `${name}.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderReviewPage(batch, undefined, latestVerification(batch)), 'utf8');
  process.stdout.write(`${out}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
