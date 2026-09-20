#!/usr/bin/env tsx
/**
 * scripts/extract-library.ts — extract the checklist library from the legacy app.
 *
 * The legacy app (arazim-apps-portal.vercel.app/work-safety/) keeps its whole
 * library in ONE inline <script>. Three top-level array literals:
 *
 *   CATEGORIES  23  { id, label, sites? }
 *   ITEMS      157  { id, cat, q, src, sec, sites? }
 *   DOCS        19  { id, t, s, sites? }
 *
 * `sites` is the site-type filter: ["construction"] | ["factory"] | absent.
 * ABSENT MEANS BOTH — 41 items, 4 docs and 7 categories carry no `sites`
 * and therefore apply to every site type. Treating absent as "none" is the
 * single easiest way to silently lose a third of the library.
 *
 * Field meanings (short keys in the source):
 *   q   = the check question, verbatim
 *   src = the law the citation points at
 *   sec = the regulation/section number
 *   t   = document title
 *   s   = document citation
 *
 * VERBATIM. No normalisation, no spelling fixes, no "improvements".
 * A wrong citation is a legal error, not a typo. See docs/04-CONTENT-LIBRARY.md.
 *
 * Usage:
 *   pnpm tsx scripts/extract-library.ts --html=legacy.html --out=data/
 *   pnpm tsx scripts/extract-library.ts --verify-only
 *
 * Getting legacy.html: log into the legacy app, view-source, save the page.
 * The library is in the second inline <script> (~112KB).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Counts asserted against the live app on 2026-09-21. A mismatch means the
 *  extraction is broken, or the library changed and this must be re-approved. */
const EXPECTED = {
  categories: 23,
  items: 157,
  docs: 19,
  construction: { categories: 17, items: 112, docs: 13 },
  factory:      { categories: 13, items:  86, docs: 10 },
  noSites:      { categories:  7, items:  41, docs:  4 },
  perCategory: {
    setup: 5, mgmt: 8, training: 7, platforms: 7, scaffold: 11, height: 11,
    ladders: 6, formwork: 6, excavation: 8, demolition: 5, cranes: 10,
    lifting: 9, machines: 6, access_f: 5, pressure: 5, hazmat: 6, hygiene: 4,
    elec: 3, roofwork: 4, order: 6, fire: 6, ppe: 10, welfare: 9,
  } as Record<string, number>,
};

type SiteType = 'construction' | 'factory';
interface RawCategory { id: string; label: string; sites?: SiteType[] }
interface RawItem { id: string; cat: string; q: string; src: string; sec: string; sites?: SiteType[] }
interface RawDoc { id: string; t: string; s: string; sites?: SiteType[] }

/**
 * Pull one top-level array literal out of the script by bracket matching.
 * Regex alone cannot do this — the literals contain brackets in Hebrew strings.
 */
function grabArrayLiteral(source: string, name: string): string {
  const decl = source.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`));
  if (!decl || decl.index === undefined) throw new Error(`declaration not found: ${name}`);
  const start = source.indexOf('[', decl.index);
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`unterminated array: ${name}`);
}

/** Object literals with unquoted keys are not JSON. Evaluate as a JS expression. */
function parseArrayLiteral<T>(literal: string): T[] {
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literal};`)() as T[];
}

function extractInlineScript(html: string): string {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]);
  const hit = scripts.find((s) => /(?:const|let|var)\s+ITEMS\s*=\s*\[/.test(s));
  if (!hit) throw new Error('no inline script declares ITEMS');
  return hit;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Absent `sites` means the entry applies to EVERY site type. */
const appliesTo = (e: { sites?: SiteType[] }, site: SiteType) => !e.sites || e.sites.includes(site);

function verify(cats: RawCategory[], items: RawItem[], docs: RawDoc[]): string[] {
  const errs: string[] = [];
  const eq = (what: string, got: number, want: number) => {
    if (got !== want) errs.push(`${what}: got ${got}, expected ${want}`);
  };

  eq('categories', cats.length, EXPECTED.categories);
  eq('items', items.length, EXPECTED.items);
  eq('docs', docs.length, EXPECTED.docs);

  for (const site of ['construction', 'factory'] as SiteType[]) {
    const e = EXPECTED[site];
    eq(`${site}.categories`, cats.filter((c) => appliesTo(c, site)).length, e.categories);
    eq(`${site}.items`, items.filter((i) => appliesTo(i, site)).length, e.items);
    eq(`${site}.docs`, docs.filter((d) => appliesTo(d, site)).length, e.docs);
  }

  eq('noSites.items', items.filter((i) => !i.sites).length, EXPECTED.noSites.items);
  eq('noSites.docs', docs.filter((d) => !d.sites).length, EXPECTED.noSites.docs);
  eq('noSites.categories', cats.filter((c) => !c.sites).length, EXPECTED.noSites.categories);

  for (const [cat, want] of Object.entries(EXPECTED.perCategory)) {
    eq(`category ${cat}`, items.filter((i) => i.cat === cat).length, want);
  }

  // structural integrity
  const catIds = new Set(cats.map((c) => c.id));
  for (const i of items) if (!catIds.has(i.cat)) errs.push(`item ${i.id}: unknown category ${i.cat}`);

  const dupes = (ids: string[]) => ids.filter((v, n, a) => a.indexOf(v) !== n);
  for (const [what, ids] of [
    ['category', cats.map((c) => c.id)],
    ['item', items.map((i) => i.id)],
    ['doc', docs.map((d) => d.id)],
  ] as [string, string[]][]) {
    for (const d of dupes(ids)) errs.push(`duplicate ${what} id: ${d}`);
  }

  for (const i of items) {
    if (!i.q?.trim()) errs.push(`item ${i.id}: empty question`);
    if (!i.src?.trim()) errs.push(`item ${i.id}: missing citation source`);
  }
  for (const d of docs) if (!d.t?.trim()) errs.push(`doc ${d.id}: empty title`);

  return errs;
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? 'true'];
    }),
  );

  const htmlPath = args.html ?? 'legacy.html';
  const outDir = args.out ?? 'data';

  const script = extractInlineScript(readFileSync(htmlPath, 'utf8'));

  const cats = parseArrayLiteral<RawCategory>(grabArrayLiteral(script, 'CATEGORIES'));
  const items = parseArrayLiteral<RawItem>(grabArrayLiteral(script, 'ITEMS'));
  const docs = parseArrayLiteral<RawDoc>(grabArrayLiteral(script, 'DOCS'));

  const errs = verify(cats, items, docs);
  if (errs.length) {
    console.error('VERIFICATION FAILED — nothing written:\n' + errs.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`ok: ${cats.length} categories, ${items.length} items, ${docs.length} documents`);

  if (args['verify-only']) return;

  const now = new Date().toISOString().slice(0, 10);

  const outItems = items.map((i) => ({
    id: i.id,
    category: i.cat,
    text: i.q,
    citation: { law: i.src, section: i.sec },
    // absent `sites` means both — make it explicit so downstream code cannot
    // repeat the mistake of treating absent as empty
    applies_to: i.sites ?? (['construction', 'factory'] as SiteType[]),
    // scope into the legislation corpus — filled by map-citations, see docs/21
    scope: null as string | null,
    source_hash: sha256(`${i.q}|${i.src}|${i.sec}`),
  }));

  const outDocs = docs.map((d) => ({
    id: d.id,
    title: d.t,
    citation: d.s,
    applies_to: d.sites ?? (['construction', 'factory'] as SiteType[]),
    // the legacy app had NO expiry field at all, though it claimed to check
    // validity. Populated by hand from the citation — see docs/15 F4.
    validity_period: null as { months: number } | null,
    scope: null as string | null,
    source_hash: sha256(`${d.t}|${d.s}`),
  }));

  const outCats = cats.map((c) => ({
    id: c.id,
    label: c.label,
    applies_to: c.sites ?? (['construction', 'factory'] as SiteType[]),
  }));

  mkdirSync(outDir, { recursive: true });
  const meta = { version: '1.0.0', extracted_on: now, source: 'legacy work-safety app' };
  const write = (name: string, data: unknown) =>
    writeFileSync(join(outDir, name), JSON.stringify({ ...meta, data }, null, 2) + '\n', 'utf8');

  write('categories.json', outCats);
  write('checklist-items.json', outItems);
  write('required-documents.json', outDocs);

  console.log(`written to ${outDir}/`);
  console.log('next: map each citation to a corpus scope — see docs/21-LEGISLATION-CORPUS.md');
}

main();
