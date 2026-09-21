/**
 * scripts/corpus-hashes.ts — נעילת קורפוס החקיקה ב-hash.
 *
 * הקורפוס הוא המקור שממנו נגזרת כל הספרייה, ולכן שינוי בו — מכוון או לא — משנה
 * את מה שהמערכת אומרת שהחוק דורש (25-AI-SECURITY §6, "הרעלת זיכרון").
 * הקובץ `data/legislation/HASHES.json` מחזיק sha256 לכל נוסח; כל סטייה נכשלת.
 *
 * עדכון ה-hash הוא פעולה מפורשת (`--write`), והשינוי ב-HASHES.json נראה בקומיט —
 * כך רענון מנבו עובר דרך עיני אדם ולא נבלע בשקט.
 *
 * הרצה:
 *   pnpm corpus:check     # מאמת; יוצא עם 1 אם משהו השתנה, נוסף או נמחק
 *   pnpm corpus:hash      # כותב מחדש אחרי רענון מכוון
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CORPUS_DIR = join(REPO_ROOT, 'data', 'legislation');
export const HASHES_FILE = join(CORPUS_DIR, 'HASHES.json');

/** כל קובצי ה-md תחת הקורפוס, כולל INDEX ו-README, ממוינים לפלט יציב. */
function listCorpusFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

export function computeCorpusHashes(dir: string = CORPUS_DIR): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of listCorpusFiles(dir)) {
    const key = relative(dir, file).replaceAll('\\', '/');
    out[key] = createHash('sha256').update(readFileSync(file)).digest('hex');
  }
  return out;
}

export interface CorpusDiff {
  changed: string[];
  added: string[];
  removed: string[];
}

export function diffHashes(expected: Record<string, string>, actual: Record<string, string>): CorpusDiff {
  return {
    changed: Object.keys(expected).filter((k) => k in actual && actual[k] !== expected[k]),
    added: Object.keys(actual).filter((k) => !(k in expected)),
    removed: Object.keys(expected).filter((k) => !(k in actual)),
  };
}

export function readLockedHashes(): Record<string, string> {
  return JSON.parse(readFileSync(HASHES_FILE, 'utf8')) as Record<string, string>;
}

function main(argv: string[]): number {
  const actual = computeCorpusHashes();
  if (argv.includes('--write')) {
    writeFileSync(HASHES_FILE, JSON.stringify(actual, null, 2) + '\n', 'utf8');
    process.stdout.write(`נכתבו ${Object.keys(actual).length} hash ל-${relative(REPO_ROOT, HASHES_FILE)}\n`);
    return 0;
  }
  const diff = diffHashes(readLockedHashes(), actual);
  const problems = [
    ...diff.changed.map((f) => `השתנה: ${f}`),
    ...diff.added.map((f) => `נוסף:   ${f}`),
    ...diff.removed.map((f) => `נמחק:  ${f}`),
  ];
  if (problems.length > 0) {
    process.stderr.write(`הקורפוס לא תואם ל-HASHES.json:\n${problems.join('\n')}\n`);
    process.stderr.write('אם הרענון מכוון: pnpm corpus:hash, ולבדוק בקומיט מה השתנה.\n');
    return 1;
  }
  process.stdout.write(`הקורפוס תואם: ${Object.keys(actual).length} קבצים\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
