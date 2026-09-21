/**
 * Committee Scope Reference Catalog — 57 canonical scope items.
 *
 * Source-of-truth (IDs + categories): the `coverage_tracker` view in
 *   `supabase/migrations/0001_initial_schema.sql` (the inlined `scope_ids` CTE).
 *   That view is the canonical 57-item set; this file mirrors it 1:1 in TypeScript.
 * Hebrew item-labels (`label`): taken from `docs/content-scope.md` per row.
 *
 * Usage:
 *   - Validate `scope_refs` on chunks/questions/scenarios against known IDs.
 *   - Render the admin coverage screen (`/admin/coverage`) and scope filters.
 *
 * INVARIANT: this array MUST stay in sync with the `coverage_tracker` view.
 *   Adding/removing a scope item requires editing BOTH the SQL view and this file.
 *   `tests/unit/db/scope-refs.test.ts` asserts count === 57, unique IDs, and
 *   that every category is present.
 */

/** Canonical category labels — must match the `category` column in `coverage_tracker`. */
export const SCOPE_CATEGORIES = [
  'ארגון הפיקוח',
  'פקודת הבטיחות',
  'גהות + רפואה',
  'חוקים-עזר',
  'תקני ISO',
  'שיטות-ניתוח',
  'גופים-מוסדיים',
] as const;

export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];

/** A single committee-scope item. */
export interface ScopeRef {
  /** Dotted scope ID, e.g. '2.4.1'. Matches `coverage_tracker.scope_id`. */
  readonly id: string;
  /** Hebrew item-label from `docs/content-scope.md`. */
  readonly label: string;
  /** Canonical category, matching `coverage_tracker.category`. */
  readonly category: ScopeCategory;
}

/**
 * All 57 scope items, ordered by ID exactly as the `coverage_tracker` view orders them.
 * Categories mirror the view's `category` column; labels are sourced from content-scope.md.
 */
export const SCOPE_REFS: readonly ScopeRef[] = [
  // ── 1. ארגון הפיקוח (8) ──
  { id: '1.0', label: 'חוק ארגון הפיקוח על העבודה', category: 'ארגון הפיקוח' },
  { id: '1.1', label: 'תקנות (ממונים על הבטיחות)', category: 'ארגון הפיקוח' },
  { id: '1.2', label: 'תקנות (תכנית לניהול הבטיחות)', category: 'ארגון הפיקוח' },
  { id: '1.3', label: 'תקנות (מסירת מידע והדרכת עובדים)', category: 'ארגון הפיקוח' },
  { id: '1.4', label: 'תקנות (ועדות בטיחות ונאמני בטיחות)', category: 'ארגון הפיקוח' },
  { id: '1.5', label: 'פקודת תאונות ומחלות משלוח-יד', category: 'ארגון הפיקוח' },
  { id: '1.5.1', label: 'תקנות התאונות (הודעה על מקרים מסוכנים)', category: 'ארגון הפיקוח' },
  { id: '1.5.2', label: 'תקנות מחלות מקצוע (חובת הודעה)', category: 'ארגון הפיקוח' },

  // ── 2. פקודת הבטיחות (17) ──
  { id: '2.0', label: 'פקודת הבטיחות בעבודה [נוסח חדש]', category: 'פקודת הבטיחות' },
  { id: '2.1', label: 'תקנות (עבודה בגובה)', category: 'פקודת הבטיחות' },
  { id: '2.2', label: 'תקנות (עבודות בניה)', category: 'פקודת הבטיחות' },
  { id: '2.3', label: 'תקנות (ציוד מגן אישי)', category: 'פקודת הבטיחות' },
  { id: '2.4', label: 'תקנות (חשמל)', category: 'פקודת הבטיחות' },
  { id: '2.4.1', label: 'תקנות חשמל (מתקן חי או בקרבתו)', category: 'פקודת הבטיחות' },
  { id: '2.4.2', label: 'תקנות חשמל (מתקן ארעי באתר בניה)', category: 'פקודת הבטיחות' },
  { id: '2.5', label: 'תקנות (עזרה ראשונה במקומות עבודה)', category: 'פקודת הבטיחות' },
  {
    id: '2.6',
    label: 'תקנות (עגורנאים, מפעילי מכונות-הרמה, אתתים)',
    category: 'פקודת הבטיחות',
  },
  { id: '2.6.1', label: 'תקנות (עגורני-צריח)', category: 'פקודת הבטיחות' },
  { id: '2.6.2', label: 'תקנות (מלגזות + הרמת בני-אדם)', category: 'פקודת הבטיחות' },
  { id: '2.7', label: 'תקנות (גיליון בטיחות SDS)', category: 'פקודת הבטיחות' },
  { id: '2.8', label: 'תקנות (מכונות חקלאיות + טרקטורים)', category: 'פקודת הבטיחות' },
  { id: '2.9', label: 'תקנות (עבודה על גגות שבירים/תלולים)', category: 'פקודת הבטיחות' },
  { id: '2.10', label: 'תקנות (דוד-קיטור + מתקני-לחץ)', category: 'פקודת הבטיחות' },
  { id: '2.11', label: 'תקנות (מעליות + דרגנועים + מעלונים)', category: 'פקודת הבטיחות' },
  { id: '2.11.1', label: 'חוק התכנון והבנייה (למעליות)', category: 'פקודת הבטיחות' },

  // ── 3. גהות + רפואה (11) ──
  { id: '3.1', label: 'תקנות (ניטור סביבתי + ביולוגי)', category: 'גהות + רפואה' },
  { id: '3.2', label: 'תקנות (גהות + רעש)', category: 'גהות + רפואה' },
  { id: '3.3', label: 'תקנות (גהות + אבק מזיק)', category: 'גהות + רפואה' },
  { id: '3.4', label: 'תקנות (גהות + קרינה מייננת)', category: 'גהות + רפואה' },
  { id: '3.5', label: 'תקנות בטיחות ממוקדות-חומרים', category: 'גהות + רפואה' },
  { id: '3.5.1', label: 'תקנות (גהות + בנזן)', category: 'גהות + רפואה' },
  { id: '3.5.2', label: 'תקנות (גהות + כספית)', category: 'גהות + רפואה' },
  { id: '3.5.3', label: 'תקנות (חומרי-הדברה — חקלאות)', category: 'גהות + רפואה' },
  {
    id: '3.6',
    label: 'תקנות (גהות במעבדות רפואיות/כימיות/ביולוגיות)',
    category: 'גהות + רפואה',
  },
  { id: '3.7', label: 'תקנות (גהות + קרינת-לייזר)', category: 'גהות + רפואה' },
  { id: '3.8', label: 'רפואה תעסוקתית', category: 'גהות + רפואה' },

  // ── 4. חוקים-עזר (6) ──
  { id: '4.1', label: 'חוק עבודת נשים', category: 'חוקים-עזר' },
  { id: '4.2', label: 'חוק עבודת הנוער', category: 'חוקים-עזר' },
  { id: '4.3', label: 'חוק רישוי עסקים + תקנות + צו', category: 'חוקים-עזר' },
  { id: '4.3.1', label: 'תקנות רישוי עסקים (אחסנת-נפט)', category: 'חוקים-עזר' },
  { id: '4.4', label: 'חוק החומרים המסוכנים', category: 'חוקים-עזר' },
  { id: '4.5', label: 'חוק הגז + תקן בטיחות גפ"מ + גז-טבעי', category: 'חוקים-עזר' },

  // ── 5. תקני ISO (6) ──
  { id: '5.1', label: 'ת"י 45001 (ISO 45001)', category: 'תקני ISO' },
  { id: '5.2', label: 'ת"י 18001 (OHSAS 18001)', category: 'תקני ISO' },
  { id: '5.3', label: 'ת"י 31010 (ISO/IEC 31010)', category: 'תקני ISO' },
  { id: '5.4', label: 'ת"י 31000 (ISO 31000)', category: 'תקני ISO' },
  { id: '5.5', label: 'IEC 61882 (HAZOP)', category: 'תקני ISO' },
  { id: '5.6', label: 'OSHA Hierarchy of Controls', category: 'תקני ISO' },

  // ── 6. שיטות-ניתוח (5) ──
  { id: '6.1', label: 'JSA (Job Safety Analysis)', category: 'שיטות-ניתוח' },
  { id: '6.2', label: 'FMEA (Failure Mode + Effects Analysis)', category: 'שיטות-ניתוח' },
  { id: '6.3', label: 'HAZOP (IEC 61882)', category: 'שיטות-ניתוח' },
  { id: '6.4', label: 'Bow Tie', category: 'שיטות-ניתוח' },
  { id: '6.5', label: 'Check List + What If', category: 'שיטות-ניתוח' },

  // ── 7. גופים-מוסדיים (4) ──
  { id: '7.1', label: 'המוסד לבטיחות וגהות', category: 'גופים-מוסדיים' },
  { id: '7.2', label: 'מכון התקנים', category: 'גופים-מוסדיים' },
  { id: '7.3', label: 'המשרד להגנת הסביבה', category: 'גופים-מוסדיים' },
  {
    id: '7.4',
    label: 'קרן למימון פעולות-בטיחות (ביטוח לאומי)',
    category: 'גופים-מוסדיים',
  },
];

/** Total number of canonical scope items (matches `SELECT count(*) FROM coverage_tracker`). */
export const SCOPE_REFS_COUNT = SCOPE_REFS.length;

/** All valid scope IDs as a flat readonly array (convenient for membership checks). */
export const SCOPE_REF_IDS: readonly string[] = SCOPE_REFS.map((s) => s.id);

/** Fast lookup: scope ID → ScopeRef. */
export const SCOPE_REF_BY_ID: ReadonlyMap<string, ScopeRef> = new Map(
  SCOPE_REFS.map((s) => [s.id, s]),
);

/** Type guard: is the given string a known canonical scope ID? */
export function isValidScopeId(id: string): boolean {
  return SCOPE_REF_BY_ID.has(id);
}
