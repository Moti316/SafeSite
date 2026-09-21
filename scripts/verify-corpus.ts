/**
 * scripts/verify-corpus.ts — שער CI לאימות הקורפוס (L2–L5), שנכשל כשיש כשל.
 *
 * `pnpm legislation:verify` (fetch-legislation של studi) מדווח על כשלים אבל תמיד
 * יוצא עם קוד 0, ולכן אינו חוסם merge. כדי לא לשנות את הקוד של studi, השער הזה
 * מריץ את אותו בודק טהור בדיוק (`verifyLegislationContent`) על אותו מניפסט,
 * ויוצא עם 1 אם נוסח כלשהו חסר או נכשל. אזהרות (תוכן כתמונה, פערי מספור) אינן כשל.
 *
 * הרצה: pnpm corpus:verify
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { verifyLegislationContent } from '../src/lib/import/verify-legislation.ts';
import { LEGISLATION_SOURCES, fileNameFor, relPathFor, validateManifest } from './legislation-manifest.ts';

function main(): number {
  const manifestErrors = validateManifest();
  if (manifestErrors.length > 0) {
    process.stderr.write(`המניפסט לא תקין:\n${manifestErrors.join('\n')}\n`);
    return 1;
  }
  const failures: string[] = [];
  let warned = 0;
  for (const source of LEGISLATION_SOURCES) {
    const path = resolve(relPathFor(source));
    if (!existsSync(path)) {
      failures.push(`חסר: ${relPathFor(source)}`);
      continue;
    }
    const result = verifyLegislationContent(readFileSync(path, 'utf8'), {
      fileName: fileNameFor(source),
      officialTitle: source.officialTitle,
      expectedScopeId: source.scopeId,
    });
    if (!result.ok) {
      const failed = result.checks.filter((c) => !c.ok).map((c) => `${c.id}${c.detail ? ` (${c.detail})` : ''}`);
      failures.push(`${fileNameFor(source)}: ${failed.join(', ')}`);
    }
    if (result.warnings.length > 0) warned++;
  }
  if (failures.length > 0) {
    process.stderr.write(`${failures.length} נוסחים נכשלו באימות:\n${failures.join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`${LEGISLATION_SOURCES.length} נוסחים תקינים · ${warned} עם אזהרות מוכרות\n`);
  return 0;
}

process.exitCode = main();
