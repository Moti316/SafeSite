/**
 * scripts/extract-obligations.ts — שלב 1 בבניית הספרייה: איתור סעיפי חובה בנוסח.
 *
 * ראה docs/13-LIBRARY-BUILD.md. הפלט הוא **מועמדים**, לא סעיפי בדיקה:
 * שום דבר כאן לא נכנס לייצור בלי ניסוח ואישור ממונה בטיחות.
 *
 * דטרמיניסטי ולא-גנרטיבי: אין רשת, אין AI. הציטוט הוא שורה מהנוסח כמות שהיא,
 * והסקריפט מוודא בעצמו שכל ציטוט נמצא מילה במילה בקובץ המקור.
 *
 * העיקרון שמכוון את ההחלטות כאן: החמצה גרועה מרעש. מועמד מיותר עולה לממונה
 * עשר שניות של דחייה; חובה שלא חולצה נעלמת גם ממדידת הכיסוי.
 *
 * הרצה (Node 24, ללא תלויות):
 *   node scripts/extract-obligations.ts            # 2.2 ו-2.1 → data/obligations/
 *   node scripts/extract-obligations.ts --check    # רק מוודא שהפלט בריפו עדכני
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── קבועים ──────────────────────────────────────────────────────────────────

/** גל 1 בלבד (13-LIBRARY-BUILD, "סדר עדיפויות"). הרחבה = גל חדש, החלטה מפורשת. */
export const WAVE_1_SCOPES = ['2.2', '2.1'] as const;

export type Site = 'construction' | 'factory';

/**
 * תחולה ברמת הנוסח. זו הנחת מוצא לממונה, לא קביעה משפטית.
 * - 2.2: התקנות חלות על עבודות בניה (תקנה 1, "בניה", בהפניה לפקודה ולצו).
 * - 2.1: תקנה 3(א) מחילה על מפעל, והגדרת "מבצע" (תקנה 1, פסקה (3)) כוללת
 *   מבצע בניה — ולכן שניהם.
 */
const SCOPE_APPLIES_TO: Record<string, Site[]> = {
  '2.2': ['construction'],
  '2.1': ['construction', 'factory'],
};

const HEB = '\\u05D0-\\u05EA';
/** קידומות שאינן משנות את החובה: "ויותקן", "שיימצא", "כשיותקן". */
const PREFIX = '(?:ו|ש|וש|כש)?';

function word(w: string): RegExp {
  return new RegExp(`(?<![${HEB}])${PREFIX}${w}(?![${HEB}])`);
}

export interface Marker {
  id: string;
  test: (text: string) => boolean;
  /**
   * doc — הרשימה שב-13-LIBRARY-BUILD.
   * morphology — משפחת צורות, ולא מילה. ראה ההערה מתחת לרשימת המסמך.
   */
  source: 'doc' | 'morphology';
}

function literal(id: string, body: string): Marker {
  const re = word(body);
  return { id, test: (t) => re.test(t), source: 'doc' };
}

/** סימני החובה מ-docs/13-LIBRARY-BUILD.md, שלב 1 — כלשונם. */
const DOC_MARKERS: Marker[] = [
  literal('חייב', 'חייב(?:ים|ת)?'),
  literal('אחראי לכך', 'אחראי(?:ם|ת)? לכך'),
  literal('לא ייעשה אלא', `לא (?:ייעשה|תיעשה|ייעשו)[^.;:]*?(?<![${HEB}])אלא`),
  literal('יינקטו', 'יינקטו'),
  literal('יותקן', '(?:יותקן|תותקן|יותקנו)'),
  literal('יימצא', '(?:יימצא|תימצא|יימצאו)'),
  literal('ימנה', 'ימנה'),
  literal('יודיע', 'יודיע'),
  literal('אין להשתמש', 'אין להשתמש'),
  literal('לא יפעיל', 'לא יפעיל'),
  literal('יש לוודא', 'יש לוודא'),
];

/**
 * למה רשימת המסמך לא מספיקה.
 *
 * רשימת אחת-עשרה המילים תופסת פחות ממחצית החובות בשני נוסחי גל 1, והיא
 * מחמיצה בדיוק את מה שממונה בודק בשטח: "מנהל העבודה יבדוק כל פיגום"
 * (2.2, תקנה 20), "מנהל העבודה יערוך ביקורת" (122), "לא תבוצע עבודת טיפוס
 * תרנים, אלא בהתקיים תנאים אלה" (2.1, תקנה 40). הסיבה מבנית: בחקיקה
 * הישראלית החובה מנוסחת בפועל עתיד כלשהו, והפעלים אינם קבוצה סגורה.
 *
 * לכן במקום להאריך את רשימת המילים — ארבע משפחות של צורות. ההטיה היא
 * לטובת רגישות: מועמד מיותר עולה לממונה שניות של דחייה, וחובה שלא חולצה
 * נעלמת גם ממדידת הכיסוי (13-LIBRARY-BUILD, "מדידת כיסוי").
 * `sections_without_candidates` בפלט הוא רשת הביטחון על מה שנותר בחוץ.
 */

/** פעלים שצורתם עתיד אך אינם מטילים חובה: תחולה, חזקה משפטית, שמירת דינים. */
const NOT_OBLIGATION_VERBS = new Set([
  'יחול', 'תחול', 'יחולו', 'יחולו', 'יראו', 'יראוהו', 'יגרע', 'יגרעו', 'רשאי', 'רשאית',
]);

/** מילים שאינן פעלים אך נפתחות כמו צורת עתיד סבילה. */
const NOT_VERB_WORDS = new Set([
  'יותר', 'יום', 'יומי', 'יומית', 'יומיים', 'יומו', 'תוך', 'תוכן', 'תוכנית', 'תכנית',
  'תוספת', 'תוספות', 'תורן', 'תורנים', 'תוצאה', 'תוצאות', 'תוצרת', 'יוצר', 'יוזם',
  'תיקון', 'תיקונים', 'תיאום', 'תיעוד', 'תיכון', 'תיחום', 'תיבה', 'תיק', 'ייצור',
  'ייעוד', 'ייעודי', 'ייעודית', 'יסוד', 'יסודי', 'יסודות', 'תנועה', 'תאורה', 'תקופה',
  'תמונה', 'תשובה', 'תעודה', 'תעודות',
]);

/** רק קידומות חיבור — לא מ'/ל'/ב', שהן חלק מהמילה ב"מבצע", "מנהל", "בונה". */
const PREFIX_RE = new RegExp(`^(?:וש|כש|ו|ש|ה)(?=[${HEB}]{2,})`);

function words(text: string): string[] {
  return text.match(new RegExp(`[${HEB}]+`, 'g')) ?? [];
}

function stripPrefix(w: string): string {
  return w.replace(PREFIX_RE, '');
}

/** עתיד סביל — נפעל והופעל: ייעשה, תיערך, יורחקו, יותאמו, יוגנו, ייתמך. */
function isPassiveFuture(w: string): boolean {
  if (NOT_VERB_WORDS.has(w) || NOT_OBLIGATION_VERBS.has(w)) return false;
  return /^(?:יי|תי|יו|תו)[א-ת]{2,5}$/.test(w);
}

/** עתיד פועל/פוּעל בן ארבע אותיות ומעלה עם ו' באמצע: יבוצעו, יחוברו, תבוצע, יאוחסנו. */
function isMiddleVavFuture(w: string): boolean {
  if (NOT_VERB_WORDS.has(w) || NOT_OBLIGATION_VERBS.has(w)) return false;
  return /^[ית][א-ת]ו[א-ת]{2,3}ו?$/.test(w);
}

/** מי שהחוק מטיל עליו חובה באתר או במפעל — להבדיל מרשות מאשרת. */
const ACTORS = [
  'מבצע', 'מבצעים', 'מנהל', 'מנהלי', 'תופש', 'תופשי', 'מעביד', 'מעבידים', 'מעסיק',
  'עובד', 'עובדים', 'קבלן', 'מזמין', 'בונה', 'מפעיל', 'ממונה', 'אחראי', 'יצרן', 'יבואן',
];

function isActor(w: string): boolean {
  return ACTORS.includes(w) || ACTORS.includes(stripPrefix(w));
}

/** פועל עתיד בגוף שלישי אחרי שם הפועֵל: "מנהל העבודה יבדוק", "מבצע בניה יציג". */
function hasActorFuture(text: string): boolean {
  const ws = words(text);
  for (let i = 0; i < ws.length; i++) {
    if (!isActor(ws[i])) continue;
    // עד שלוש מילים של לוואי בין שם הפועֵל לפועל: "מנהל העבודה", "מבצע בניה".
    for (let j = i + 1; j <= Math.min(i + 4, ws.length - 1); j++) {
      const w = ws[j];
      if (w === 'לא') continue;
      if (NOT_OBLIGATION_VERBS.has(w) || NOT_VERB_WORDS.has(w)) break;
      // רק ו'/ש'/ה' לפני הפועל. כל אות אחרת הופכת שמות עצם לפעלים ("ביצוע").
      if (/^[ושה]?[ית][א-ת]{2,6}$/.test(w) && !isActor(w)) return true;
    }
  }
  return false;
}

const MORPHOLOGY_MARKERS: Marker[] = [
  {
    // "לא ... אלא" — האיסור עם החריג, הצורה השכיחה ביותר לחובה בשני הנוסחים.
    id: 'לא ... אלא',
    test: (t) => new RegExp(`(?<![${HEB}])לא[^.;:]{0,200}?(?<![${HEB}])אלא(?![${HEB}])`).test(t),
    source: 'morphology',
  },
  {
    // איסור: "לא יורם", "לא יונח", "לא תבוצע", "לא יידרש".
    id: 'לא + עתיד',
    test: (t) => {
      const ws = words(t);
      return ws.some((w, i) => i > 0 && (ws[i - 1] === 'לא' || ws[i - 1] === 'שלא' || ws[i - 1] === 'ולא') && /^[ית][א-ת]{2,6}$/.test(w) && !NOT_OBLIGATION_VERBS.has(w) && !NOT_VERB_WORDS.has(w));
    },
    source: 'morphology',
  },
  { id: 'בעל חובה + עתיד', test: hasActorFuture, source: 'morphology' },
  { id: 'עתיד סביל', test: (t) => words(t).some(isPassiveFuture), source: 'morphology' },
  { id: 'עתיד עם ו׳ אמצעית', test: (t) => words(t).some(isMiddleVavFuture), source: 'morphology' },
  {
    // רבים סתמי, בלי נושא: "ירחיקוהו מאתר הבניה" (2.2, 19(ב)), "ישתמשו", "יתקינו".
    id: 'עתיד רבים סתמי',
    test: (t) =>
      words(t).some(
        (w) =>
          /^י[א-ת]{3,5}(?:ו|והו|וה)$/.test(w) &&
          !NOT_OBLIGATION_VERBS.has(w) &&
          !NOT_VERB_WORDS.has(w),
      ),
    source: 'morphology',
  },
  {
    id: 'יש ל',
    test: (t) => new RegExp(`(?<![${HEB}])יש ל[${HEB}]`).test(t),
    source: 'morphology',
  },
  {
    // "יהיו גדורים", "תהיה הרצפה נמוכה" — חובת תכונה, לא חובת פעולה.
    id: 'יהיה',
    test: (t) => word('(?:יהיה|תהיה|יהיו|תהיינה|יהא)').test(t),
    source: 'morphology',
  },
  { id: 'אסור', test: (t) => word('(?:אסור|אסורה|ייאסר|נאסר)').test(t), source: 'morphology' },
  { id: 'אחראי', test: (t) => word('אחראי(?:ם|ת)?(?! לכך)').test(t), source: 'morphology' },
];

export const MARKERS: Marker[] = [...DOC_MARKERS, ...MORPHOLOGY_MARKERS];

/** כותרות שוליים שהטקסט תחתיהן אינו מטיל חובה. */
const NON_OBLIGATION_HEADINGS = /^(?:הגדרות|הגדרה|פרשנות|השם|שם|תחילה|ביטול|הוראות מעבר|תחולה)$/;

// ── סוגים ───────────────────────────────────────────────────────────────────

export interface Candidate {
  /** יציב בין הרצות: scope + נתיב. */
  id: string;
  scope: string;
  /** מספר התקנה כפי שבנוסח, למשל "12" או "12א". */
  section: string;
  /** נתיב מלא, למשל "8(א)(1)(ב)". */
  path: string;
  /** true כשתווית עברית יכלה להיות גם תת-תקנה וגם תת-פסקה. הנתיב ניחוש; הציטוט לא. */
  path_ambiguous: boolean;
  chapter: string | null;
  heading: string | null;
  /** השורה מהנוסח, מילה במילה. זה ה-source_excerpt העתידי. */
  quote: string;
  /** שורות הרישה (הסיפא הפותחת ב-":" או "–") שהשורה תלויה בהן, מילה במילה. */
  lead_in: string[];
  /** סימני חובה בשורה עצמה. */
  markers: string[];
  /** סימני חובה שעוברים בירושה מהרישה. מועמד שכולו בירושה — markers ריק. */
  inherited_markers: string[];
  /** true אם אף סימן מרשימת המסמך לא נתפס, והשורה נתפסה במשפחת צורות בלבד. */
  beyond_doc_list: boolean;
  applies_to: Site[];
  applies_to_basis: 'scope' | 'text-mentions-construction';
  line: number;
}

export interface ScopeResult {
  scope: string;
  title: string;
  source_file: string;
  source_sha256: string;
  version_date: string;
  section_count: number;
  sections_with_candidates: number;
  /** תקנות שלא נמצא בהן אף מועמד — לבדיקה ידנית. זה מה שמונע החמצה שקטה. */
  sections_without_candidates: string[];
  candidates: Candidate[];
}

// ── פענוח ───────────────────────────────────────────────────────────────────

interface Frontmatter {
  scope_id: string;
  title: string;
  version_date: string;
  section_count: number;
}

export function parseFrontmatter(md: string): { fm: Frontmatter; bodyStartLine: number } {
  const lines = md.split('\n');
  if (lines[0].trim() !== '---') throw new Error('frontmatter חסר');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('frontmatter לא נסגר');
  const raw: Record<string, string> = {};
  for (const l of lines.slice(1, end)) {
    const m = l.match(/^(\w+):\s*(.*)$/);
    if (m) raw[m[1]] = m[2].replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
  }
  for (const k of ['scope_id', 'title', 'version_date', 'section_count']) {
    if (!(k in raw)) throw new Error(`frontmatter: חסר ${k}`);
  }
  return {
    fm: {
      scope_id: raw.scope_id,
      title: raw.title,
      version_date: raw.version_date,
      section_count: Number(raw.section_count),
    },
    bodyStartLine: end + 1,
  };
}

const HEBREW_ORDINALS = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
];

function nextHebrew(label: string | null): string | null {
  if (label === null) return 'א';
  const i = HEBREW_ORDINALS.indexOf(label);
  return i >= 0 && i + 1 < HEBREW_ORDINALS.length ? HEBREW_ORDINALS[i + 1] : null;
}

/** 1 = תת-תקנה (א), 2 = פסקה (1), 3 = פסקת משנה (א). */
type Level = 1 | 2 | 3;

interface Node {
  level: 0 | Level;
  label: string;
  text: string;
  isLeadIn: boolean;
  markers: string[];
}

const SECTION_RE = /^(\d+[א-ת]?)\.\s+(.*)$/;
const LABEL_RE = /^\(([^()\s]{1,4})\)\s*/;

export function findMarkers(text: string): Marker[] {
  return MARKERS.filter((m) => m.test(text));
}

/** רישה: שורה שמסתיימת בנקודתיים או במקף, ופותחת רשימה. */
function isLeadIn(text: string): boolean {
  return /[:–-]\s*$/.test(text);
}

function sectionKey(s: string): [number, number] {
  const m = s.match(/^(\d+)([א-ת]?)$/)!;
  return [Number(m[1]), m[2] ? HEBREW_ORDINALS.indexOf(m[2]) + 1 : 0];
}

/**
 * section_count ב-frontmatter הוא מספר התקנה הגבוה ביותר (fetch-legislation.ts,
 * maxSection), לא ספירה — "11א" לא מוסיפה לו. לכן שתי בדיקות:
 * המספר הגבוה תואם, והסדר עולה ממש. תקנה מצוטטת בתוך תקנה אחרת שובר את הסדר.
 */
export function assertSectionSequence(scope: string, seen: string[], declaredMax: number): void {
  for (let i = 1; i < seen.length; i++) {
    const [a, b] = [sectionKey(seen[i - 1]), sectionKey(seen[i])];
    if (b[0] < a[0] || (b[0] === a[0] && b[1] <= a[1])) {
      throw new Error(`${scope}: תקנה ${seen[i]} אחרי ${seen[i - 1]} — הפענוח שגוי, לא לכתוב פלט.`);
    }
  }
  const max = seen.length ? sectionKey(seen[seen.length - 1])[0] : 0;
  if (max !== declaredMax) {
    throw new Error(`${scope}: תקנה אחרונה ${max}, ב-frontmatter ${declaredMax} — הפענוח שגוי, לא לכתוב פלט.`);
  }
}

export function extractFromMarkdown(md: string, sourceFile: string, sites?: Site[]): ScopeResult {
  const { fm, bodyStartLine } = parseFrontmatter(md);
  const lines = md.split('\n');
  const scope = fm.scope_id;
  const scopeSites = sites ?? SCOPE_APPLIES_TO[scope];
  if (!scopeSites) throw new Error(`אין תחולה מוגדרת ל-${scope} — הוסף ל-SCOPE_APPLIES_TO`);

  const candidates: Candidate[] = [];
  const sectionsSeen: string[] = [];
  const sectionsWithCandidates = new Set<string>();

  let chapter: string | null = null;
  let heading: string | null = null;
  let prevWasHeading = false;
  let section: string | null = null;
  let skipSection = false;
  // מחסנית לפי רמה: [0] רישת התקנה, [1..3] התוויות הפתוחות.
  let stack: (Node | undefined)[] = [];
  let lastLevel: 0 | Level = 0;

  for (let i = bodyStartLine; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (raw.startsWith('# ')) { prevWasHeading = false; continue; }
    if (raw.startsWith('## ')) {
      const h = raw.slice(3).trim();
      if (/^פרק\s/.test(h)) chapter = h; else heading = h;
      prevWasHeading = true;
      continue;
    }
    const text = raw.trim();
    if (!text) continue;

    let rest = text;
    let isSectionStart = false;
    // תחילת תקנה = "N. " מיד אחרי כותרת שוליים. בלי התנאי הזה, תקנה מצוטטת
    // בתוך תקנה אחרת (למשל "54." בתוך 3(ב)(3) ב-2.1) נספרת כתקנה חדשה.
    const sm = prevWasHeading ? rest.match(SECTION_RE) : null;
    prevWasHeading = false;
    if (sm) {
      section = sm[1];
      sectionsSeen.push(section);
      rest = sm[2];
      stack = [];
      lastLevel = 0;
      isSectionStart = true;
      skipSection = heading !== null && NON_OBLIGATION_HEADINGS.test(heading);
    }
    if (section === null) continue; // דברי פתיחה לפני תקנה 1

    // תוויות בראש השורה — יכולות להיות כמה: "8. (א) ..." או "(ב) (1) ...".
    const labels: { level: Level; label: string; ambiguous: boolean }[] = [];
    let lm: RegExpMatchArray | null;
    while ((lm = rest.match(LABEL_RE))) {
      const label = lm[1];
      const numeric = /^\d/.test(label);
      let level: Level;
      let ambiguous = false;
      if (numeric) {
        level = 2;
      } else if (labels.length > 0 && labels[labels.length - 1].level === 2) {
        level = 3; // "(1) (א)" באותה שורה
      } else if (labels.length > 0 || isSectionStart) {
        level = 1;
      } else {
        const open3 = stack[3]?.label ?? null;
        const open1 = stack[1]?.label ?? null;
        const inPara = stack[2] !== undefined;
        const fits3 = inPara && label === nextHebrew(open3);
        const fits1 = label === nextHebrew(open1);
        if (fits3 && fits1) { level = 3; ambiguous = true; }
        else if (fits3) level = 3;
        else if (fits1) level = 1;
        else { level = inPara ? 3 : 1; ambiguous = true; }
      }
      labels.push({ level, label, ambiguous });
      rest = rest.slice(lm[0].length);
    }

    let level: 0 | Level;
    let continuation = false;
    if (labels.length > 0) {
      for (const l of labels) {
        stack[l.level] = { level: l.level, label: l.label, text: '', isLeadIn: false, markers: [] };
        for (let k = l.level + 1; k <= 3; k++) stack[k] = undefined;
      }
      level = labels[labels.length - 1].level;
    } else if (isSectionStart) {
      level = 0;
    } else {
      // שורה בלי תווית ("ובלבד ש...", פירוט בהגדרה): סיפא של הרמה האחרונה.
      level = lastLevel;
      continuation = true;
    }
    lastLevel = level;

    const own = findMarkers(text);
    const node: Node = {
      level,
      label: labels.length ? labels[labels.length - 1].label : '',
      text: raw,
      isLeadIn: isLeadIn(text),
      markers: own.map((m) => m.id),
    };
    if (!continuation) stack[level] = node;

    if (skipSection) continue;

    const ancestors = stack.slice(0, level).filter((n): n is Node => n !== undefined);
    const leadIns = ancestors.filter((a) => a.isLeadIn && a.text !== raw);
    const inherited = [...new Set(leadIns.flatMap((a) => a.markers))];
    if (own.length === 0 && inherited.length === 0) continue;

    const pathLabels = [1, 2, 3]
      .map((k) => stack[k as Level]?.label)
      .filter((x): x is string => !!x && x !== '');
    const path = section + pathLabels.map((l) => `(${l})`).join('');
    const ownIds = own.map((m) => m.id);
    const allMarkers = [...own, ...MARKERS.filter((m) => inherited.includes(m.id))];
    const beyondDocList = allMarkers.every((m) => m.source !== 'doc');
    const mentionsConstruction =
      scopeSites.length > 1 &&
      [raw, ...leadIns.map((a) => a.text)].some((t) => /(?<![א-ת])(?:ב|ו|וב)?(?:עבודות בניה|אתר בניה)/.test(t));

    const baseId = `${scope}:${path}${continuation ? '+' : ''}`;
    let id = baseId;
    for (let n = 2; candidates.some((c) => c.id === id); n++) id = `${baseId}#${n}`;

    candidates.push({
      id,
      scope,
      section,
      path,
      path_ambiguous: labels.some((l) => l.ambiguous),
      chapter,
      heading,
      quote: raw,
      lead_in: leadIns.map((a) => a.text),
      markers: ownIds,
      inherited_markers: inherited.filter((m) => !ownIds.includes(m)),
      beyond_doc_list: beyondDocList,
      applies_to: mentionsConstruction ? ['construction'] : [...scopeSites],
      applies_to_basis: mentionsConstruction ? 'text-mentions-construction' : 'scope',
      line: lineNo,
    });
    sectionsWithCandidates.add(section);
  }

  assertSectionSequence(scope, sectionsSeen, fm.section_count);

  // הערובה: כל ציטוט וכל רישה נמצאים בנוסח כלשונם.
  for (const c of candidates) {
    for (const t of [c.quote, ...c.lead_in]) {
      if (!md.includes(t)) throw new Error(`${c.id}: ציטוט לא נמצא בנוסח`);
    }
  }

  const skippedSections = new Set<string>();
  {
    let h: string | null = null;
    let prevH = false;
    for (const l of lines.slice(bodyStartLine)) {
      if (l.startsWith('## ')) { const t = l.slice(3).trim(); if (!/^פרק\s/.test(t)) h = t; prevH = true; continue; }
      const m = prevH ? l.trim().match(SECTION_RE) : null;
      prevH = false;
      if (m && h !== null && NON_OBLIGATION_HEADINGS.test(h)) skippedSections.add(m[1]);
    }
  }

  return {
    scope,
    title: fm.title,
    source_file: sourceFile,
    source_sha256: createHash('sha256').update(md).digest('hex'),
    version_date: fm.version_date,
    section_count: fm.section_count,
    sections_with_candidates: sectionsWithCandidates.size,
    sections_without_candidates: sectionsSeen.filter(
      (s) => !sectionsWithCandidates.has(s) && !skippedSections.has(s),
    ),
    candidates,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = join(REPO_ROOT, 'data', 'legislation');
const OUT_DIR = join(REPO_ROOT, 'data', 'obligations');

export function findScopeFile(scope: string): string {
  for (const chapter of readdirSync(CORPUS_DIR, { withFileTypes: true })) {
    if (!chapter.isDirectory()) continue;
    const dir = join(CORPUS_DIR, chapter.name);
    const hit = readdirSync(dir).find((f) => f.startsWith(`${scope}-`) && f.endsWith('.md'));
    if (hit) return join(dir, hit);
  }
  throw new Error(`לא נמצא נוסח ל-${scope} ב-data/legislation`);
}

export function render(result: ScopeResult): string {
  const doc = {
    _note:
      'מועמדים שחולצו אוטומטית — לא סעיפי בדיקה. לא נכנס לייצור בלי ניסוח ואישור ממונה. ' +
      'ראה docs/13-LIBRARY-BUILD.md. קובץ מחולל: node scripts/extract-obligations.ts',
    ...result,
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

function main(argv: string[]): number {
  const check = argv.includes('--check');
  mkdirSync(OUT_DIR, { recursive: true });
  let stale = 0;
  for (const scope of WAVE_1_SCOPES) {
    const file = findScopeFile(scope);
    const md = readFileSync(file, 'utf8');
    const result = extractFromMarkdown(md, relative(REPO_ROOT, file).replaceAll('\\', '/'));
    const out = join(OUT_DIR, `${scope}.json`);
    const text = render(result);
    const docOnly = result.candidates.filter((c) => !c.beyond_doc_list).length;
    const summary =
      `${scope}  ${result.section_count} תקנות · ${result.candidates.length} מועמדים ` +
      `(${docOnly} מרשימת המסמך, ${result.candidates.length - docOnly} רק מההרחבה) · ` +
      `${result.sections_without_candidates.length} תקנות בלי מועמד`;
    if (check) {
      let current = '';
      try { current = readFileSync(out, 'utf8'); } catch { /* חסר = לא עדכני */ }
      if (current !== text) { stale++; process.stderr.write(`לא עדכני: ${relative(REPO_ROOT, out)}\n`); }
    } else {
      writeFileSync(out, text, 'utf8');
      process.stdout.write(summary + '\n');
    }
  }
  return stale > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
