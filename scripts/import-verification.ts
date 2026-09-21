/**
 * scripts/import-verification.ts — מייבא את תוצאת האימות של סוכן הדפדפן.
 *
 * הרצה: pnpm library:import-verification <result.json>
 * ← data/verification/<verified_on>.json, ואחר כך pnpm library:review <batch>
 *
 * הקובץ יכול להכיל גם טקסט סביב בלוק ה-JSON (הסוכן מחזיר סיכום לפניו) — נלקח
 * רק הבלוק. שום דבר ממנו לא משנה טיוטה או אישור; הוא מוצג לממונה בלבד.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateVerification, type Verification } from '../src/lib/library/verification.ts';
import { loadBatches } from './validate-drafts.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** בלוק JSON אחרון בתוך גדר ```json, או כל הקובץ אם הוא JSON נקי. */
export function extractJson(text: string): unknown {
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const last = fences.at(-1)?.[1];
  return JSON.parse(last ?? text);
}

function main(argv: string[]): number {
  const [file] = argv;
  if (!file) {
    process.stderr.write('שימוש: pnpm library:import-verification <result.json>\n');
    return 1;
  }
  let data: unknown;
  try { data = extractJson(readFileSync(file, 'utf8')); }
  catch { process.stderr.write('לא נמצא בלוק JSON תקין בקובץ.\n'); return 1; }

  const errors = validateVerification(data, loadBatches());
  if (errors.length > 0) {
    process.stderr.write(`${errors.length} בעיות בקובץ האימות — לא יובא:\n${errors.join('\n')}\n`);
    return 1;
  }
  const v = data as Verification;
  const out = join(REPO_ROOT, 'data', 'verification', `${v.verified_on}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(v, null, 2) + '\n', 'utf8');
  const counts = v.items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.verdict]: (m[i.verdict] ?? 0) + 1 }), {});
  process.stdout.write(`${out}\n${JSON.stringify(counts)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
