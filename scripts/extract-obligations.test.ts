/**
 * בדיקות ל-scripts/extract-obligations.ts.
 *
 * הרצה: node --test scripts/
 *
 * שלוש שכבות: פענוח המבנה, זיהוי סימני החובה, והערובה שהפלט בריפו נגזר
 * מהקורפוס הנוכחי ולא התיישן.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MARKERS,
  WAVE_1_SCOPES,
  assertSectionSequence,
  extractFromMarkdown,
  findMarkers,
  findScopeFile,
  parseFrontmatter,
  render,
} from './extract-obligations.ts';

/** נוסח סינתטי. section_count נגזר מהגוף, כמו ב-fetch-legislation (maxSection). */
function md(...body: string[]): string {
  const numbers = body
    .map((l) => l.match(/^(\d+)[א-ת]?\.\s/))
    .filter((m): m is RegExpMatchArray => m !== null);
  const max = Math.max(0, ...numbers.map((m) => Number(m[1])));
  const fm = [
    '---',
    "scope_id: '9.9'",
    "title: 'תקנות לבדיקה'",
    "version_date: '2026-01-01'",
    `section_count: ${max}`,
    '---',
    '',
    '# תקנות לבדיקה',
  ];
  return [...fm, ...body].join('\n') + '\n';
}

/** לנוסח סינתטי אין ערך ב-SCOPE_APPLIES_TO, ולכן התחולה נמסרת במפורש. */
function extract(doc: string) {
  return extractFromMarkdown(doc, 'test.md', ['construction']);
}

// ── frontmatter ─────────────────────────────────────────────────────────────

test('parseFrontmatter קורא את השדות הנדרשים', () => {
  const { fm } = parseFrontmatter(md('## חובה', '3. מבצע יוודא כי המעקה תקין.'));
  assert.equal(fm.scope_id, '9.9');
  assert.equal(fm.title, 'תקנות לבדיקה');
  assert.equal(fm.section_count, 3);
});

test('parseFrontmatter נכשל כשחסר שדה', () => {
  const broken = md('## חובה', '3. מבצע יוודא כי המעקה תקין.').replace("version_date: '2026-01-01'\n", '');
  assert.throws(() => parseFrontmatter(broken), /version_date/);
});

// ── רצף התקנות ──────────────────────────────────────────────────────────────

test('assertSectionSequence מקבל רצף עולה עם תקנות משולבות', () => {
  assert.doesNotThrow(() => assertSectionSequence('2.2', ['1', '2', '11א', '12'], 12));
});

test('assertSectionSequence תופס תקנה מצוטטת בתוך תקנה אחרת', () => {
  // המקרה האמיתי: תקנה 54 מצוטטת בתוך 3(ב)(3) ב-2.1.
  assert.throws(() => assertSectionSequence('2.1', ['1', '2', '3', '54', '4'], 62), /54/);
});

test('assertSectionSequence תופס פער מול section_count', () => {
  assert.throws(() => assertSectionSequence('2.2', ['1', '2'], 198), /198/);
});

// ── סימני חובה ──────────────────────────────────────────────────────────────

const OBLIGATIONS: [string, string][] = [
  ['2.2 תקנה 20(א)', 'מנהל העבודה יבדוק כל פיגום לקביעת יציבותו והתאמתו למטרה שלה הוא נועד.'],
  ['2.2 תקנה 7', 'מבצע בניה יציג, במקום בולט לעין, באתר שבו מבוצעת פעולת הבניה, שלט'],
  ['2.2 תקנה 23(א)', 'פירוק פיגום ייעשה באופן הדרגתי מלמעלה למטה, על כל חלקיו'],
  ['2.2 תקנה 89', 'התומכות לטפסות אפקיות יועמדו בצורה אנכית.'],
  ['2.2 תקנה 104', 'לא יורם רכיב טרומי שעה שנושבת רוח העלולה לסכן את המטפלים בו'],
  ['2.2 תקנה 181', 'החמרים, הכלים, הציוד יאוחסנו באופן יציב ומסודר'],
  ['2.2 תקנה 62', 'רצפת פיגום תלוי המורם באמצעות כננת ידנית באורך שלא יעלה על 4 מטרים'],
  ['2.2 תקנה 67(ב)', 'הזיזים יהיו בעלי חוזק נאות, עשויים מתכת ומעוגנים בצורה בטוחה'],
  ['2.1 תקנה 40', 'לא תבוצע עבודת טיפוס תרנים, אלא בהתקיים תנאים אלה:'],
  ['2.1 תקנה 9', 'מבצע יוודא כי לצורך הגנת עובד המועסק בעבודה בגובה, ייעשו פעולות אלה:'],
  // הוחמץ בגרסה הראשונה; התקנה עצמה נתפסה בזכות תת-תקנות אחרות, ולכן הרשת לא התריעה.
  ['2.2 תקנה 19(ב)', '(ב) נפסל רכיב כאמור בתקנת משנה (א), ירחיקוהו מאתר הבניה.'],
];

for (const [where, line] of OBLIGATIONS) {
  test(`סימן חובה מזוהה — ${where}`, () => {
    assert.ok(findMarkers(line).length > 0, `לא זוהה סימן חובה: ${line}`);
  });
}

const NOT_OBLIGATIONS: string[] = [
  'תקנות אלה יחולו על מפעל.',
  'הוראות פרק זה אינן באות לגרוע מן האמור בתקנות הבטיחות בעבודה',
  'הטיל המזמין את ביצוע הבניה על קבלן ראשי, יראוהו כמבצע הבניה לענין תקנות אלה',
  '" תורן " – עמוד או מבנה אחר שגובהו עולה על 6 מטרים;',
  'תקנה זו תחול גם על מבנה ארעי, ותקנה 9 תחול עליו בשינויים המחויבים.',
];

for (const line of NOT_OBLIGATIONS) {
  test(`לא מזוהה כחובה — ${line.slice(0, 40)}`, () => {
    const hits = findMarkers(line).map((m) => m.id);
    assert.deepEqual(hits, [], `זוהה בטעות: ${hits.join(', ')}`);
  });
}

test('לכל סימן יש מזהה ייחודי', () => {
  const ids = MARKERS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── חילוץ ממסמך ─────────────────────────────────────────────────────────────

test('ירושת רישה: פסקה בלי סימן משלה נתפסת דרך הרישה שמעליה', () => {
  const doc = md(
    '## חובת בדיקה',
    '5. מנהל העבודה יערוך ביקורת בכל אחד מאלה:',
    '(1) מדי יום לפני התחלת העבודה;',
    '(2) לאחר הפסקה של יותר משלושה ימים;',
  );
  const r = extract(doc);
  const sub = r.candidates.find((c) => c.path === '5(1)');
  assert.ok(sub, 'הפסקה לא נתפסה');
  assert.deepEqual(sub.markers, []);
  assert.ok(sub.inherited_markers.length > 0);
  assert.equal(sub.lead_in[0], '5. מנהל העבודה יערוך ביקורת בכל אחד מאלה:');
  assert.equal(sub.quote, '(1) מדי יום לפני התחלת העבודה;');
});

test('נתיב מלא נבנה מהתוויות', () => {
  const doc = md(
    '## תנאים',
    '5. (א) לא יעסיק מבצע עובד אלא בהתקיים אלה:',
    '(1) העובד בגיר;',
    '(א) גילו מעל 18;',
    '(ב) בידו תעודה;',
    '(2) העובד הודרך;',
    '(ב) הוראה נוספת: המבצע יודיע למפקח.',
  );
  const paths = extract(doc).candidates.map((c) => c.path);
  assert.ok(paths.includes('5(א)(1)(ב)'), paths.join(' '));
  assert.ok(paths.includes('5(ב)'), paths.join(' '));
});

test('הגדרות אינן מייצרות מועמדים', () => {
  const doc = md(
    '## הגדרות',
    '1. בתקנות אלה –',
    '" פיגום " – מיתקן שיותקן לצורך עבודה בגובה;',
    '## חובת גידור',
    '2. משטח עבודה יגודר במעקה תקני.',
  );
  const r = extract(doc);
  assert.deepEqual(r.candidates.map((c) => c.section), ['2']);
  assert.deepEqual(r.sections_without_candidates, []);
});

test('תקנה בלי סימן חובה מדווחת ב-sections_without_candidates', () => {
  const doc = md(
    '## תחולה כללית',
    '2. הוראות פרק זה אינן באות לגרוע מכל דין אחר.',
    '## גידור',
    '3. משטח עבודה יגודר במעקה תקני.',
  );
  const r = extract(doc);
  assert.deepEqual(r.sections_without_candidates, ['2']);
});

test('פענוח שגוי עוצר לפני כתיבת פלט', () => {
  const doc = md('## חובה', '9. מבצע יוודא כי המעקה תקין.').replace('section_count: 9', 'section_count: 12');
  assert.throws(() => extract(doc), /לא לכתוב פלט/);
});

// ── הקורפוס האמיתי ──────────────────────────────────────────────────────────

for (const scope of WAVE_1_SCOPES) {
  const file = findScopeFile(scope);
  const source = readFileSync(file, 'utf8');
  const result = extractFromMarkdown(source, file);

  test(`${scope}: כל ציטוט נמצא בנוסח מילה במילה`, () => {
    for (const c of result.candidates) {
      for (const quote of [c.quote, ...c.lead_in]) {
        assert.ok(source.includes(quote), `${c.id}: ${quote.slice(0, 60)}`);
      }
    }
  });

  test(`${scope}: מזהי המועמדים ייחודיים`, () => {
    const ids = result.candidates.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test(`${scope}: לכל מועמד תחולה תקפה`, () => {
    for (const c of result.candidates) {
      assert.ok(c.applies_to.length > 0);
      for (const site of c.applies_to) assert.ok(site === 'construction' || site === 'factory');
    }
  });

  test(`${scope}: הפלט בריפו עדכני מול הקורפוס`, () => {
    const committed = readFileSync(`data/obligations/${scope}.json`, 'utf8');
    assert.equal(
      render(extractFromMarkdown(source, committed.match(/"source_file": "(.*?)"/)![1])),
      committed,
      'הרץ node scripts/extract-obligations.ts',
    );
  });
}

test('2.2: חובות הליבה של אתר הבנייה חולצו', () => {
  const r = extractFromMarkdown(readFileSync(findScopeFile('2.2'), 'utf8'), 'x');
  const sections = new Set(r.candidates.map((c) => c.section));
  // בדיקת פיגום, ביקורת חפירה, בדיקת מגדל — מה שממונה בודק בפועל.
  for (const s of ['20', '122', '152', '9', '72']) {
    assert.ok(sections.has(s), `תקנה ${s} בלי מועמד`);
  }
});

test('2.1: תחולה כפולה, עם צמצום לבנייה כשהנוסח אומר זאת', () => {
  const r = extractFromMarkdown(readFileSync(findScopeFile('2.1'), 'utf8'), 'x');
  const both = r.candidates.filter((c) => c.applies_to.length === 2);
  const narrowed = r.candidates.filter((c) => c.applies_to_basis === 'text-mentions-construction');
  assert.ok(both.length > 0);
  assert.ok(narrowed.length > 0);
  for (const c of narrowed) assert.deepEqual(c.applies_to, ['construction']);
});
