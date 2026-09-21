import { describe, expect, it } from 'vitest';

import { validateBatch, type DraftBatch, type DraftItem } from '@/lib/library/drafts';
import { applyReview, type DecisionDoc, type ReviewExport } from '@/lib/library/review';
import { loadBatches, loadContext } from '../../../scripts/validate-drafts.ts';

const batch = loadBatches().find((b) => b.batch === '2.2-scaffolds-general') as DraftBatch;
const ctx = loadContext('2.2');
const MOTI = 'u_moti';
const SECOND = 'u_second';
const reviewers = {
  [MOTI]: { full_name: 'מוטי לוי', license_no: '12345' },
  [SECOND]: { full_name: 'מאשר שני', license_no: '67890' },
};

function item(n: number): DraftItem {
  const it = batch.items[n];
  if (!it) throw new Error(`אין סעיף ${n}`);
  return it;
}

function decide(it: DraftItem, uid: string, d: Partial<DecisionDoc>): [string, DecisionDoc] {
  return [`${it.id}~${uid}`, {
    decision: 'approve', by: uid, at: '2026-09-22T08:00:00Z', batch: batch.batch,
    seen_text: it.text, seen_excerpt: it.source_excerpt, ...d,
  }];
}

function run(entries: [string, DecisionDoc][], approvals = 1, rv = reviewers) {
  const exp: ReviewExport = { decisions: Object.fromEntries(entries), reviewers: rv };
  return applyReview(batch, exp, approvals);
}

describe('החלת החלטות סקירה', () => {
  it('אישור כותב reviewed_by עם שם ומספר אישור כשירות', () => {
    const { batch: out, report } = run([decide(item(0), MOTI, {})]);
    const it = out.items.find((i) => i.id === item(0).id);
    expect(it?.reviewed_by).toBe('מוטי לוי (אישור כשירות 12345)');
    expect(it?.reviewed_on).toBe('2026-09-22');
    expect(report.approved).toEqual([item(0).id]);
    expect(validateBatch(out, ctx)).toEqual([]);
  });

  it('ניסוח מחדש מחליף את הנוסח ומסמן אותו כמאושר', () => {
    const { batch: out, report } = run([decide(item(1), MOTI, { decision: 'rewrite', text: 'האם הפיגום תואם להוראות היצרן?' })]);
    const it = out.items.find((i) => i.id === item(1).id);
    expect(it?.text).toBe('האם הפיגום תואם להוראות היצרן?');
    expect(it?.reviewed_by).toContain('מוטי לוי');
    expect(report.rewritten).toEqual([item(1).id]);
  });

  it('דחייה מעבירה ל-rejected, והאצווה נשארת מכוסה ותקינה', () => {
    const { batch: out, report } = run([decide(item(13), MOTI, { decision: 'reject', note: 'אין חובת רישום' })]);
    expect(out.items.some((i) => i.id === item(13).id)).toBe(false);
    expect(out.rejected?.[0]?.reason).toBe('אין חובת רישום');
    expect(report.rejected).toEqual([item(13).id]);
    expect(validateBatch(out, ctx)).toEqual([]);
  });

  it('פיצול משאיר את הסעיף לא מאושר ומדווח', () => {
    const { batch: out, report } = run([decide(item(2), MOTI, { decision: 'split', note: 'להפריד' })]);
    expect(out.items.find((i) => i.id === item(2).id)?.reviewed_by).toBeNull();
    expect(report.toSplit).toEqual([{ id: item(2).id, note: 'להפריד' }]);
  });

  it('החלטה על נוסח שהשתנה אחריה — לא חלה', () => {
    const { batch: out, report } = run([decide(item(0), MOTI, { seen_text: 'נוסח ישן?' })]);
    expect(out.items.find((i) => i.id === item(0).id)?.reviewed_by).toBeNull();
    expect(report.skipped.some((s) => s.includes('השתנתה'))).toBe(true);
  });

  it('מאשר בלי שם ומספר אישור — לא חל', () => {
    const { report } = run([decide(item(0), 'u_anon', {})]);
    expect(report.approved).toEqual([]);
    expect(report.skipped.some((s) => s.includes('אישור כשירות'))).toBe(true);
  });

  it('מסמך שה-by שלו אינו בעל המפתח — לא חל', () => {
    const [key, doc] = decide(item(0), MOTI, {});
    const { report } = run([[key, { ...doc, by: SECOND }]]);
    expect(report.approved).toEqual([]);
  });

  it('דרישה לשני מאשרים: אחד לא מספיק, שניים כן', () => {
    expect(run([decide(item(0), MOTI, {})], 2).report.approved).toEqual([]);
    const { batch: out } = run([decide(item(0), MOTI, {}), decide(item(0), SECOND, {})], 2);
    expect(out.items.find((i) => i.id === item(0).id)?.reviewed_by).toBe(
      'מוטי לוי (אישור כשירות 12345) · מאשר שני (אישור כשירות 67890)',
    );
  });

  it('מאשרים שהחליטו אחרת — לא מוחל, דורש יישוב', () => {
    const { report } = run([decide(item(0), MOTI, {}), decide(item(0), SECOND, { decision: 'reject', note: 'לא' })]);
    expect(report.approved).toEqual([]);
    expect(report.skipped.some((s) => s.includes('דורש יישוב'))).toBe(true);
  });

  it('הצעת דחייה שהממונה הסכים לה — מדווחת כמאושרת', () => {
    const nd = batch.not_drafted[0];
    if (!nd) throw new Error('אין הצעת דחייה');
    const { report } = run([['nd-0~' + MOTI, {
      decision: 'agree', by: MOTI, at: '2026-09-22T08:00:00Z', batch: batch.batch, candidate: nd.candidate,
    }]]);
    expect(report.ndConfirmed).toEqual([nd.candidate]);
  });

  it('ללא החלטות — האצווה לא משתנה', () => {
    const { batch: out, report } = run([]);
    expect(out).toEqual(batch);
    expect(report.pending).toHaveLength(batch.items.length);
  });
});
