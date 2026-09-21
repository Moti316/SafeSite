/**
 * tests/unit/import/strip-nevo-html.test.ts
 *
 * Unit tests for the deterministic Nevo legislation extractor. The headline
 * property is VERBATIM fidelity: the emitted markdown body must be token-
 * identical to a permissive "drop all tags" extraction of the same region
 * (L1 zero-loss). We also assert title/version-date extraction, the empty-`##`
 * anchor fix, chrome removal, and section-number continuity (L2).
 *
 * The fixture mirrors the real Nevo `law_html` structure observed on scope 2.3
 * (74835.htm): <h1> title, "נוסח עדכני נכון ליום", <h6> margin-titles, empty
 * <h6> anchor wrappers, <defenition> term tags inside paragraphs, numbered
 * <p> sections, a <table> תוספת, and <script>/<style> chrome.
 */

import { describe, expect, it } from 'vitest';
import {
  stripNevoHtml,
  permissiveText,
  tokenize,
  LosslessViolationError,
} from '@/lib/import/strip-nevo-html';

const NEVO_FIXTURE = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>.x{color:red}</style>
<script>function track(){var a=1+2;/* 99 */}</script>
</head><body>
<div class="adsbygoogle">פרסומת</div>
<h1>תקנות הבטיחות בעבודה (ציוד מגן אישי), תשנ"ז-1997</h1>
<p>נוסח עדכני נכון ליום: 11-10-2023</p>
<p>בתוקף סמכותי לפי סעיף 47 &ndash; אני מתקין תקנות אלה:</p>
<h6>הגדרות</h6>
<p>1. בתקנות אלה &#8211;</p>
<h6></h6>
<p>"<defenition>ממונה על העבודה</defenition>" &#8211; לרבות "מנהל עבודה";</p>
<h6>מניעת סיכונים</h6>
<p>2. מקום עבודה שלא ניתן למנוע בו סיכונים &amp; מפגעים.</p>
<h6>חובות המעביד</h6>
<p>3. המעביד יספק ציוד מגן אישי כמפורט בתוספת.</p>
<h6>ביטול</h6>
<p>4. תקנות קודמות &#8212; בטלות.</p>
<h6>תוספת (תקנה 3)</h6>
<table><tr><td>קסדה</td><td>עבודות בנייה</td></tr></table>
<div class="footer"><script>ads()</script></div>
</body></html>`;

describe('stripNevoHtml — metadata', () => {
  it('extracts the <h1> title verbatim', () => {
    expect(stripNevoHtml(NEVO_FIXTURE).title).toBe(
      'תקנות הבטיחות בעבודה (ציוד מגן אישי), תשנ"ז-1997',
    );
  });

  it('extracts and ISO-normalises the version date (DD-MM-YYYY → YYYY-MM-DD)', () => {
    expect(stripNevoHtml(NEVO_FIXTURE).versionDate).toBe('2023-10-11');
  });

  it('returns null version date when the marker is absent', () => {
    expect(stripNevoHtml('<h1>כותרת</h1><p>1. טקסט.</p>').versionDate).toBeNull();
  });
});

describe('stripNevoHtml — clean body', () => {
  const { body } = stripNevoHtml(NEVO_FIXTURE);

  it('starts at the title (# H1) — chrome before <h1> is dropped', () => {
    expect(body.startsWith('# תקנות הבטיחות בעבודה')).toBe(true);
    expect(body).not.toContain('פרסומת');
  });

  it('removes <script>/<style> chrome (no JS/CSS tokens leak)', () => {
    expect(body).not.toMatch(/function|track|color:red|ads\(/);
  });

  it('keeps the defined-term text but drops the <defenition> tag', () => {
    expect(body).toContain('ממונה על העבודה');
    expect(body).not.toContain('defenition');
  });

  it('drops empty "##" lines left by Nevo anchor <h6></h6> wrappers', () => {
    expect(body.split('\n').some((l) => /^#{1,2}$/.test(l))).toBe(false);
  });

  it('preserves margin-titles as ## headings', () => {
    expect(body).toContain('## הגדרות');
    expect(body).toContain('## מניעת סיכונים');
  });

  it('decodes entities verbatim (&ndash; &amp; &#8211; &#8212;)', () => {
    expect(body).toContain('סעיף 47 – אני'); // &ndash;
    expect(body).toContain('סיכונים & מפגעים'); // &amp;
    expect(body).toContain('בתקנות אלה –'); // &#8211;
    expect(body).toContain('תקנות קודמות — בטלות'); // &#8212;
  });
});

describe('stripNevoHtml — L1 zero-loss verbatim guarantee', () => {
  it('emits a body token-identical to the permissive extraction', () => {
    // This is the word-for-word control made explicit: the structural markdown
    // and a "drop all tags" extraction of the same region tokenise identically.
    const { body } = stripNevoHtml(NEVO_FIXTURE);
    const region = NEVO_FIXTURE.slice(NEVO_FIXTURE.search(/<h1[\s>]/i));
    expect(tokenize(body)).toEqual(tokenize(permissiveText(region)));
  });

  it('does not throw LosslessViolationError for well-formed input', () => {
    expect(() => stripNevoHtml(NEVO_FIXTURE)).not.toThrow(LosslessViolationError);
  });

  it('captures the תוספת table text (no legal token dropped at the end)', () => {
    const { body } = stripNevoHtml(NEVO_FIXTURE);
    expect(body).toContain('קסדה');
    expect(body).toContain('עבודות בנייה');
  });
});

describe('stripNevoHtml — L2 section-number continuity', () => {
  it('finds the leading section numbers in order (1..4, gap-free)', () => {
    expect(stripNevoHtml(NEVO_FIXTURE).sectionNumbers).toEqual([1, 2, 3, 4]);
  });

  it('counts margin-title headings', () => {
    // הגדרות, מניעת סיכונים, חובות המעביד, ביטול, תוספת (5 non-empty ## titles).
    expect(stripNevoHtml(NEVO_FIXTURE).headingCount).toBe(5);
  });
});

describe('stripNevoHtml — embedded content-image detection (source-completeness)', () => {
  it('reports imageCount=0 for a text-only page', () => {
    expect(stripNevoHtml(NEVO_FIXTURE).imageCount).toBe(0);
  });

  it('detects base64 content-images (Nevo image-appendix) + captures preceding context', () => {
    const html =
      `<h1>תקנות כלשהן, תשנ"ז-1997</h1>` +
      `<p>1. הוראה ראשונה.</p>` +
      `<h6>תוספת (תקנה 1) טבלת ציוד</h6>` +
      `<img src="data:image/png;base64,iVBORw0KGgoAAAANSU="/>` +
      `<img src="data:image/jpeg;base64,/9j/4AAQSkZJRg=="/>`;
    const r = stripNevoHtml(html);
    expect(r.imageCount).toBe(2);
    expect(r.imageContexts.length).toBeGreaterThan(0);
    expect(r.imageContexts.some((c) => c.includes('תוספת'))).toBe(true);
    // the base64 blob itself must NOT leak into the verbatim body
    expect(r.body).not.toContain('base64');
    expect(r.body).not.toContain('iVBOR');
  });
});
