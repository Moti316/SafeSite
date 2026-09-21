/**
 * scripts/validate-drafts.ts — מאמת את כל אצוות הטיוטה ב-data/drafts/.
 *
 * הרצה: pnpm library:drafts    (יוצא עם 1 אם יש הפרה)
 * הכללים: src/lib/library/drafts.ts · התהליך: docs/28-LIBRARY-REVIEW.md
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  duplicateIdsAcrossBatches,
  validateBatch,
  type CandidateRef,
  type DraftBatch,
  type DraftContext,
} from '../src/lib/library/drafts.ts';
import { findScopeFile, parseFrontmatter } from './extract-obligations.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS_DIR = join(REPO_ROOT, 'data', 'drafts');
const OBLIGATIONS_DIR = join(REPO_ROOT, 'data', 'obligations');

export function loadBatches(dir: string = DRAFTS_DIR): DraftBatch[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as DraftBatch);
}

export function loadContext(scope: string): DraftContext {
  const corpusText = readFileSync(findScopeFile(scope), 'utf8');
  const obligations = JSON.parse(readFileSync(join(OBLIGATIONS_DIR, `${scope}.json`), 'utf8')) as {
    candidates: CandidateRef[];
  };
  return {
    corpusText,
    corpusTitle: parseFrontmatter(corpusText).fm.title,
    corpusSha256: createHash('sha256').update(corpusText).digest('hex'),
    candidates: new Map(obligations.candidates.map((c) => [c.id, c])),
  };
}

export function validateAll(batches: DraftBatch[]): string[] {
  const contexts = new Map<string, DraftContext>();
  const errors = batches.flatMap((b) => {
    let ctx = contexts.get(b.scope);
    if (!ctx) {
      ctx = loadContext(b.scope);
      contexts.set(b.scope, ctx);
    }
    return validateBatch(b, ctx);
  });
  return [...errors, ...duplicateIdsAcrossBatches(batches).map((d) => `מזהה כפול בין אצוות — ${d}`)];
}

function main(): number {
  const batches = loadBatches();
  const errors = validateAll(batches);
  if (errors.length > 0) {
    process.stderr.write(`${errors.length} הפרות:\n${errors.join('\n')}\n`);
    return 1;
  }
  const items = batches.reduce((n, b) => n + b.items.length, 0);
  const reviewed = batches.reduce((n, b) => n + b.items.filter((i) => i.reviewed_by).length, 0);
  process.stdout.write(`${batches.length} אצוות · ${items} בדיקות · ${reviewed} אושרו — תקין\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
