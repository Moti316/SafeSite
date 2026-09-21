/**
 * src/lib/library/drafts.ts — הסכמה והמאמת של אצוות טיוטה בספרייה.
 *
 * אצווה היא שלב 2 בבניית הספרייה (docs/13-LIBRARY-BUILD.md): בדיקות שנוסחו
 * ממועמדי חובה, לפני אישור ממונה. המאמת כאן הוא הערובה שטיוטה נשארת צמודה
 * לחוק — ציטוט מילה במילה, אסמכתא נכונה, וכיסוי מלא של המועמדים באצווה.
 *
 * טהור: אין I/O. הקורפוס והמועמדים מוזרקים ב-`DraftContext`.
 */

export type Site = 'construction' | 'factory';

export interface DraftItem {
  id: string;
  category: string;
  /** השאלה שתופיע בשטח. "כן" = תקין. */
  text: string;
  scope: string;
  citation: { law: string; section: string };
  /** מילה במילה מהנוסח, ומתוך אחד המועמדים ב-derived_from. */
  source_excerpt: string;
  applies_to: Site[];
  /** מזהי מועמדים מ-data/obligations/<scope>.json. */
  derived_from: string[];
  drafting_note?: string;
  reviewed_by: string | null;
  reviewed_on: string | null;
}

export interface NotDrafted {
  candidate: string;
  /** הצעת דחייה לממונה, לא החלטה. */
  reason: string;
}

export interface DraftBatch {
  batch: string;
  scope: string;
  law: string;
  /** hash של הנוסח בזמן הניסוח. שינוי בחוק מחזיר את האצווה כולה לבדיקה. */
  source_sha256: string;
  /** סימון מקור (25-AI-SECURITY §3): מי ניסח. */
  drafted_by: string;
  drafted_on: string;
  /** התקנות שהאצווה מתחייבת לכסות במלואן. */
  covers: string[];
  category: { id: string; label: string; applies_to: Site[] };
  items: DraftItem[];
  not_drafted: NotDrafted[];
}

/** מה שהמאמת צריך לדעת על מועמד — תת-קבוצה של Candidate ב-extract-obligations. */
export interface CandidateRef {
  id: string;
  section: string;
  path: string;
  quote: string;
  lead_in: string[];
  applies_to: Site[];
}

export interface DraftContext {
  corpusText: string;
  corpusTitle: string;
  corpusSha256: string;
  candidates: ReadonlyMap<string, CandidateRef>;
}

const ITEM_ID = /^[a-z]+-\d{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** מחזיר רשימת הפרות. רשימה ריקה = האצווה תקינה. */
export function validateBatch(b: DraftBatch, ctx: DraftContext): string[] {
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${b.batch} · ${where}: ${msg}`);

  if (!b.drafted_by?.trim()) err('אצווה', 'drafted_by חסר — אין סימון מקור');
  if (!ISO_DATE.test(b.drafted_on ?? '')) err('אצווה', 'drafted_on אינו תאריך ISO');
  if (b.law !== ctx.corpusTitle) err('אצווה', `law אינו כותרת הנוסח: "${b.law}"`);
  if (b.source_sha256 !== ctx.corpusSha256) {
    err('אצווה', 'הנוסח השתנה מאז הניסוח — האצווה כולה חוזרת לבדיקה');
  }
  if (b.covers.length === 0) err('אצווה', 'covers ריק');

  const derivedAll = new Set<string>();
  const seenIds = new Set<string>();

  for (const item of b.items) {
    const at = item.id || '(בלי מזהה)';
    if (!ITEM_ID.test(item.id)) err(at, 'מזהה אינו בתבנית category-000');
    if (seenIds.has(item.id)) err(at, 'מזהה כפול');
    seenIds.add(item.id);

    if (item.category !== b.category.id) err(at, `category "${item.category}" שונה מקטגוריית האצווה`);
    if (item.scope !== b.scope) err(at, `scope "${item.scope}" שונה מה-scope של האצווה`);
    if (!item.text.trim().endsWith('?')) err(at, 'הנוסח אינו שאלה');
    if (item.citation.law !== ctx.corpusTitle) err(at, 'citation.law אינו כותרת הנוסח המלאה');

    const excerpt = item.source_excerpt;
    if (excerpt.trim().length < 10) err(at, 'source_excerpt קצר מדי');
    if (!ctx.corpusText.includes(excerpt)) err(at, 'source_excerpt לא נמצא בנוסח מילה במילה');

    if (item.derived_from.length === 0) err(at, 'derived_from ריק');
    const sources: CandidateRef[] = [];
    for (const id of item.derived_from) {
      const c = ctx.candidates.get(id);
      if (!c) err(at, `מועמד לא קיים: ${id}`);
      else sources.push(c);
      derivedAll.add(id);
    }

    if (sources.length > 0) {
      const inCandidate = sources.some((c) => [c.quote, ...c.lead_in].some((t) => t.includes(excerpt)));
      if (!inCandidate) err(at, 'source_excerpt אינו מתוך אף מועמד שב-derived_from');

      const citations = sources.map((c) => `תקנה ${c.path}`);
      if (!citations.includes(item.citation.section)) {
        err(at, `citation.section "${item.citation.section}" אינו אחד מ: ${citations.join(', ')}`);
      }

      const allowed = new Set(sources.flatMap((c) => c.applies_to));
      if (item.applies_to.length === 0) err(at, 'applies_to ריק');
      for (const site of item.applies_to) {
        if (!allowed.has(site)) err(at, `applies_to "${site}" רחב מתחולת המועמד`);
      }
    }

    const hasBy = item.reviewed_by !== null && item.reviewed_by.trim() !== '';
    const hasOn = item.reviewed_on !== null && ISO_DATE.test(item.reviewed_on);
    if (hasBy !== hasOn) err(at, 'reviewed_by ו-reviewed_on — שניהם או אף אחד');
  }

  const notDrafted = new Set<string>();
  for (const nd of b.not_drafted) {
    if (!ctx.candidates.has(nd.candidate)) err('not_drafted', `מועמד לא קיים: ${nd.candidate}`);
    if (!nd.reason.trim()) err('not_drafted', `${nd.candidate}: נימוק חסר`);
    if (derivedAll.has(nd.candidate)) err('not_drafted', `${nd.candidate}: גם נוסח וגם הוצע לדחייה`);
    notDrafted.add(nd.candidate);
  }

  // כיסוי: כל מועמד בתקנות שהאצווה מכסה — נוסח או הוצע לדחייה במפורש.
  const covered = new Set(b.covers);
  for (const c of ctx.candidates.values()) {
    if (covered.has(c.section) && !derivedAll.has(c.id) && !notDrafted.has(c.id)) {
      err('כיסוי', `מועמד ${c.id} לא נוסח ולא הוצע לדחייה`);
    }
  }
  for (const id of derivedAll) {
    const c = ctx.candidates.get(id);
    if (c && !covered.has(c.section)) err('כיסוי', `${id} מחוץ לתקנות שב-covers`);
  }

  return errors;
}

/** מזהה בדיקה חייב להיות ייחודי בכל הספרייה, לא רק באצווה. */
export function duplicateIdsAcrossBatches(batches: DraftBatch[]): string[] {
  const owner = new Map<string, string>();
  const dups: string[] = [];
  for (const b of batches) {
    for (const item of b.items) {
      const prev = owner.get(item.id);
      if (prev !== undefined && prev !== b.batch) dups.push(`${item.id}: ${prev} וגם ${b.batch}`);
      owner.set(item.id, b.batch);
    }
  }
  return dups;
}
