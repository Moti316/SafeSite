/**
 * scripts/build-verification-brief.ts — מרכיב הוראות אימות לסוכן Claude עם דפדפן.
 *
 * הסוכן בודק כל סעיף טיוטה מול נבו ומאגר החקיקה, ומחזיר JSON. זה **אימות**, לא
 * אישור: האישור נשאר של הממונה (R16). ראה docs/28-LIBRARY-REVIEW.md.
 *
 * הרצה: pnpm library:brief [batch ...]    (בלי ארגומנטים — כל האצוות שטרם אושרו)
 *        ← build/verification/brief.md
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DraftBatch } from '../src/lib/library/drafts.ts';
import { findScopeFile, parseFrontmatter } from './extract-obligations.ts';
import { loadBatches } from './validate-drafts.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(REPO_ROOT, 'scripts', 'review-page', 'verification-brief.md');

/** תו `|` בתוך תא בטבלת markdown שובר את הטבלה. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function frontmatterField(md: string, key: string): string {
  const m = md.match(new RegExp(`^${key}:\\s*'?(.*?)'?$`, 'm'));
  return m?.[1] ?? '';
}

export function buildBrief(batches: DraftBatch[], today: string, template: string = readFileSync(TEMPLATE, 'utf8')): string {
  const scopes = [...new Set(batches.map((b) => b.scope))];
  const laws = scopes.map((scope) => {
    const md = readFileSync(findScopeFile(scope), 'utf8');
    return {
      scope,
      title: parseFrontmatter(md).fm.title,
      version: parseFrontmatter(md).fm.version_date,
      nevo: frontmatterField(md, 'source_url'),
    };
  });

  const sources = laws
    .map((l, i) => `${i + 1}. **נבו — ${l.title}**: ${l.nevo}\n   (הנוסח שלנו: גרסה מ-${l.version})`)
    .join('\n');

  const lawTable = [
    '| scope | שם החוק | הגרסה שלנו (`version_date`) | נבו |',
    '|---|---|---|---|',
    ...laws.map((l) => `| ${l.scope} | ${cell(l.title)} | ${l.version} | ${l.nevo} |`),
  ].join('\n');

  const items = batches.flatMap((b) => b.items.filter((i) => i.reviewed_by === null).map((i) => ({ b, i })));
  const itemTable = [
    '| מזהה | אסמכתא | הציטוט מהחוק | השאלה שנוסחה | הערת הניסוח |',
    '|---|---|---|---|---|',
    ...items.map(({ b, i }) =>
      `| ${i.id} | ${b.scope} · ${cell(i.citation.section)} | ${cell(i.source_excerpt)} | ${cell(i.text)} | ${cell(i.drafting_note ?? '')} |`),
  ].join('\n');

  const nd = batches.flatMap((b) => b.not_drafted);
  const ndTable = nd.length === 0 ? 'אין.' : [
    '| מועמד | הנימוק להצעה |',
    '|---|---|',
    ...nd.map((n) => `| ${n.candidate} | ${cell(n.reason)} |`),
  ].join('\n');

  return template
    .replace('{{DATE}}', today)
    .replace('{{BATCHES}}', batches.map((b) => `${b.batch} (${b.category.label})`).join(', '))
    .replace('{{COUNT}}', String(items.length))
    .replace('{{SOURCES}}', sources)
    .replace('{{LAWS}}', lawTable)
    .replace('{{ITEMS}}', itemTable)
    .replace('{{NOT_DRAFTED}}', ndTable);
}

function main(argv: string[]): number {
  const all = loadBatches();
  const chosen = argv.length ? all.filter((b) => argv.includes(b.batch)) : all.filter((b) => b.items.some((i) => i.reviewed_by === null));
  if (chosen.length === 0) {
    process.stderr.write('אין אצוות לאימות.\n');
    return 1;
  }
  const out = join(REPO_ROOT, 'build', 'verification', 'brief.md');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buildBrief(chosen, new Date().toISOString().slice(0, 10)), 'utf8');
  process.stdout.write(`${out}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
