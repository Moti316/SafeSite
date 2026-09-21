/**
 * מאמת הטיוטות: האצווה האמיתית עוברת, וכל סוג הפרה נתפס.
 * כל טסט שובר דבר אחד בעותק של האצווה, ומצפה להפרה המתאימה בלבד.
 */

import { describe, expect, it } from 'vitest';

import { duplicateIdsAcrossBatches, validateBatch, type DraftBatch } from '@/lib/library/drafts';
import { loadBatches, loadContext, validateAll } from '../../../scripts/validate-drafts.ts';

const batches = loadBatches();
const ctx = loadContext('2.2');
const original = batches.find((b) => b.batch === '2.2-scaffolds-general');
if (!original) throw new Error('אצווה 1 חסרה ב-data/drafts');

function mutate(fn: (b: DraftBatch) => void): string[] {
  const copy = structuredClone(original) as DraftBatch;
  fn(copy);
  return validateBatch(copy, ctx);
}

function firstItem(b: DraftBatch) {
  const item = b.items[0];
  if (!item) throw new Error('אצווה ריקה');
  return item;
}

describe('אצוות הטיוטה בריפו', () => {
  it('כל האצוות תקינות', () => {
    expect(validateAll(batches)).toEqual([]);
  });

  it('אצווה 1 מכסה 57 בדיקות ושתי הצעות דחייה', () => {
    expect(original.items).toHaveLength(57);
    expect(original.not_drafted).toHaveLength(2);
  });

  it('אף סעיף באצווה עוד לא אושר', () => {
    expect(original.items.every((i) => i.reviewed_by === null && i.reviewed_on === null)).toBe(true);
  });
});

describe('המאמת תופס הפרות', () => {
  it('שינוי של אות אחת בציטוט', () => {
    const errors = mutate((b) => {
      const item = firstItem(b);
      item.source_excerpt = item.source_excerpt.replace('יספק', 'יספקו');
    });
    expect(errors.some((e) => e.includes('לא נמצא בנוסח מילה במילה'))).toBe(true);
  });

  it('ציטוט שקיים בחוק אבל לא במועמד שממנו נגזר', () => {
    const errors = mutate((b) => {
      firstItem(b).source_excerpt = 'לא ישתמש אדם בפיגום סולמות לכל מטרה שהיא';
    });
    expect(errors.some((e) => e.includes('אינו מתוך אף מועמד'))).toBe(true);
  });

  it('אסמכתא שאינה תואמת את המועמד', () => {
    const errors = mutate((b) => {
      firstItem(b).citation.section = 'תקנה 99';
    });
    expect(errors.some((e) => e.includes('citation.section'))).toBe(true);
  });

  it('שם חוק מקוצר באסמכתא', () => {
    const errors = mutate((b) => {
      firstItem(b).citation.law = 'תקנות עבודות בניה';
    });
    expect(errors.some((e) => e.includes('citation.law'))).toBe(true);
  });

  it('מועמד שלא נוסח ולא הוצע לדחייה', () => {
    const errors = mutate((b) => {
      b.not_drafted = b.not_drafted.filter((n) => n.candidate !== '2.2:29(4)');
    });
    expect(errors.some((e) => e.includes('2.2:29(4) לא נוסח'))).toBe(true);
  });

  it('הנוסח השתנה מאז הניסוח', () => {
    const errors = mutate((b) => {
      b.source_sha256 = '0'.repeat(64);
    });
    expect(errors.some((e) => e.includes('חוזרת לבדיקה'))).toBe(true);
  });

  it('אישור בלי תאריך', () => {
    const errors = mutate((b) => {
      firstItem(b).reviewed_by = 'ממונה';
    });
    expect(errors.some((e) => e.includes('שניהם או אף אחד'))).toBe(true);
  });

  it('תחולה רחבה מזו של המועמד', () => {
    const errors = mutate((b) => {
      firstItem(b).applies_to = ['construction', 'factory'];
    });
    expect(errors.some((e) => e.includes('רחב מתחולת המועמד'))).toBe(true);
  });

  it('נוסח שאינו שאלה', () => {
    const errors = mutate((b) => {
      firstItem(b).text = 'יש פיגומים';
    });
    expect(errors.some((e) => e.includes('אינו שאלה'))).toBe(true);
  });

  it('סימון מקור חסר', () => {
    const errors = mutate((b) => {
      b.drafted_by = '';
    });
    expect(errors.some((e) => e.includes('סימון מקור'))).toBe(true);
  });

  it('מועמד שגם נוסח וגם הוצע לדחייה', () => {
    const errors = mutate((b) => {
      b.not_drafted.push({ candidate: '2.2:16(א)', reason: 'בדיקה' });
    });
    expect(errors.some((e) => e.includes('גם נוסח וגם הוצע לדחייה'))).toBe(true);
  });

  it('מזהה כפול בין אצוות', () => {
    const other = structuredClone(original) as DraftBatch;
    other.batch = 'אצווה-אחרת';
    expect(duplicateIdsAcrossBatches([original, other])).toHaveLength(57);
  });
});
