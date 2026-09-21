import { describe, expect, it } from 'vitest';

import type { DraftBatch } from '@/lib/library/drafts';
import { flaggedIds, validateVerification, type Verification } from '@/lib/library/verification';
import { renderReviewPage } from '../../../scripts/build-review-page.ts';
import { extractJson } from '../../../scripts/import-verification.ts';
import { loadBatches } from '../../../scripts/validate-drafts.ts';

const batches = loadBatches();
const batch = batches.find((b) => b.batch === '2.2-scaffolds-general') as DraftBatch;

function sample(over: Partial<Verification> = {}): Verification {
  return {
    verified_on: '2026-09-22',
    verifier: 'claude-browser',
    laws: [{ scope: '2.2', nevo_version_date: '2025-10-23', matches_our_version: true, amendments_after_our_version: [], in_force: true }],
    items: [
      { id: 'scaffold-001', verdict: 'תואם', checks: { V1: true }, source_url: 'https://www.nevo.co.il/law_html/law00/74821.htm' },
      { id: 'scaffold-002', verdict: 'סטייה', checks: { V4: false }, comment: 'השאלה משמיטה את התכנון' },
    ],
    ...over,
  };
}

describe('אימות מול נבו', () => {
  it('קובץ תקין עובר', () => {
    expect(validateVerification(sample(), batches)).toEqual([]);
  });

  it('מזהה שלא קיים באף אצווה — נדחה', () => {
    const v = sample({ items: [{ id: 'scaffold-999', verdict: 'תואם', checks: {} }] });
    expect(validateVerification(v, batches).some((e) => e.includes('scaffold-999'))).toBe(true);
  });

  it('ממצא שאינו "תואם" בלי הסבר — נדחה', () => {
    const v = sample({ items: [{ id: 'scaffold-001', verdict: 'סטייה', checks: {} }] });
    expect(validateVerification(v, batches).some((e) => e.includes('בלי הסבר'))).toBe(true);
  });

  it('ערך שאינו מהרשימה — נדחה, גם אם נשמע כמו אישור', () => {
    const v = sample({ items: [{ id: 'scaffold-001', verdict: 'מאושר' as never, checks: {} }] });
    expect(validateVerification(v, batches).some((e) => e.includes('אינו מהרשימה'))).toBe(true);
  });

  it('מקור מחוץ לנבו, הכנסת ו-gov.il — נדחה', () => {
    const v = sample({ items: [{ id: 'scaffold-001', verdict: 'תואם', checks: {}, source_url: 'https://example.com/law' }] });
    expect(validateVerification(v, batches).some((e) => e.includes('example.com'))).toBe(true);
  });

  it('סעיף שלא נבדק נחשב מסומן לבדיקה', () => {
    const flagged = flaggedIds(sample(), batch);
    expect(flagged).not.toContain('scaffold-001');
    expect(flagged).toContain('scaffold-002');
    expect(flagged).toContain('scaffold-003');
    expect(flagged).toHaveLength(batch.items.length - 1);
  });

  it('JSON נחלץ מתשובה עם סיכום מסביב', () => {
    const text = 'סיכום: הכל טוב.\n\n```json\n{"a":1}\n```\nסוף.';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('האימות מוטמע בדף הסקירה, והאצווה עצמה לא משתנה', () => {
    const html = renderReviewPage(batch, undefined, { verified_on: '2026-09-22', items: { 'scaffold-001': sample().items[0]! } });
    const m = html.match(/<script id="batch-data" type="application\/json">([\s\S]*?)<\/script>/);
    const data = JSON.parse(m?.[1] ?? '{}');
    expect(data.verification.items['scaffold-001'].verdict).toBe('תואם');
    expect(data.items).toEqual(batch.items);
  });
});
