import { describe, expect, it } from 'vitest';

import type { DraftBatch } from '@/lib/library/drafts';
import { embedJson, renderReviewPage } from '../../../scripts/build-review-page.ts';
import { loadBatches } from '../../../scripts/validate-drafts.ts';

const batch = loadBatches().find((b) => b.batch === '2.2-scaffolds-general') as DraftBatch;

function embedded(html: string): unknown {
  const m = html.match(/<script id="batch-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error('נתוני האצווה לא נמצאו בדף');
  return JSON.parse(m[1]);
}

describe('דף הסקירה', () => {
  it('האצווה מוטמעת בדף ונקראת חזרה זהה', () => {
    expect(embedded(renderReviewPage(batch))).toEqual(batch);
  });

  it('טקסט שסוגר תגית script לא שובר את הדף', () => {
    const evil = structuredClone(batch);
    const item = evil.items[0];
    if (!item) throw new Error('אצווה ריקה');
    item.text = '</script><script>alert(1)</script>?';
    const html = renderReviewPage(evil);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(embedded(html)).toEqual(evil);
  });

  it('embedJson מקודד את < ואת מפרידי השורה', () => {
    expect(embedJson({ a: '<b>\u2028' })).toBe('{"a":"\\u003cb>\\u2028"}');
  });

  it('הדף לא מציע "אשר הכל"', () => {
    expect(renderReviewPage(batch)).not.toMatch(/אשר הכל|אישור הכל/);
  });
});
