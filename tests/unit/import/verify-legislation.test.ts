/**
 * tests/unit/import/verify-legislation.test.ts
 *
 * Unit tests for the corpus QA gate: a well-formed legislation .md passes all
 * checks; each fidelity failure mode (missing frontmatter, bad scope, title
 * mismatch, chrome leak, mojibake) is caught. Also covers the frontmatter
 * round-trip (escaped quotes) and the L1 live token-diff cross-check.
 */

import { describe, expect, it } from 'vitest';
import {
  verifyLegislationContent,
  splitFrontmatter,
  liveTokenDiff,
} from '@/lib/import/verify-legislation';

const TITLE = 'תקנות הבטיחות בעבודה (ציוד מגן אישי), תשנ"ז-1997';

function makeFile(overrides: { fm?: Record<string, string>; body?: string } = {}): string {
  const fm: Record<string, string> = {
    scope_id: "'2.3'",
    title: `'${TITLE}'`,
    source: 'nevo',
    source_url: "'https://www.nevo.co.il/law_html/law00/74835.htm'",
    version_date: "'2023-10-11'",
    fetch_date: "'2026-06-02'",
    license: 'public-domain',
    authoritative_source: "'רשומות / קובץ-התקנות'",
    section_count: '4',
    extractor: "'fetch-legislation@1'",
    ...(overrides.fm ?? {}),
  };
  const body =
    overrides.body ??
    [
      `# ${TITLE}`,
      '## הגדרות',
      '1. בתקנות אלה – ציוד מגן אישי כמשמעותו בתוספת.',
      '2. מקום עבודה שלא ניתן למנוע בו סיכונים בטיחותיים.',
      '3. המעביד יספק לעובד ציוד מגן אישי מתאים.',
      '4. תקנות אלה תחילתן שישים ימים מיום פרסומן.',
    ].join('\n');
  const fmBlock = Object.entries(fm)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${fmBlock}\n---\n${body}\n`;
}

describe('splitFrontmatter', () => {
  it('parses keys and strips/unescapes quotes', () => {
    const { frontmatter, body } = splitFrontmatter(makeFile());
    expect(frontmatter.scope_id).toBe('2.3');
    expect(frontmatter.title).toBe(TITLE); // single-quoted, ASCII " preserved
    expect(frontmatter.license).toBe('public-domain'); // unquoted
    expect(body.startsWith(`# ${TITLE}`)).toBe(true);
  });

  it("unescapes double-quoted \\\" and single-quoted ''", () => {
    const f = '---\na: "he said \\"hi\\""\nb: \'it\'\'s\'\n---\nbody';
    const { frontmatter } = splitFrontmatter(f);
    expect(frontmatter.a).toBe('he said "hi"');
    expect(frontmatter.b).toBe("it's");
  });
});

describe('verifyLegislationContent — happy path', () => {
  it('passes all checks for a well-formed file', () => {
    const result = verifyLegislationContent(makeFile(), {
      fileName: '2.3-tziyud-magen-ishi-1997.md',
      officialTitle: TITLE,
      expectedScopeId: '2.3',
    });
    expect(result.ok, JSON.stringify(result.checks.filter((c) => !c.ok))).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});

describe('verifyLegislationContent — failure modes', () => {
  it('L5: fails on a missing frontmatter key', () => {
    const f = makeFile({ fm: { authoritative_source: undefined as unknown as string } });
    // Remove the key entirely.
    const stripped = f.replace(/authoritative_source:.*\n/, '');
    const r = verifyLegislationContent(stripped);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'L5-frontmatter-keys')?.ok).toBe(false);
  });

  it('L5: fails on an invalid scope_id', () => {
    const r = verifyLegislationContent(makeFile({ fm: { scope_id: "'9.9'" } }));
    expect(r.checks.find((c) => c.id === 'L5-valid-scope')?.ok).toBe(false);
  });

  it('L3: fails when the H1 title disagrees with frontmatter', () => {
    const r = verifyLegislationContent(makeFile({ body: '# כותרת אחרת לגמרי\n1. טקסט.' }));
    expect(r.checks.find((c) => c.id === 'L3-title-h1-matches-frontmatter')?.ok).toBe(false);
  });

  it('L3: fails when chrome leaks into the body', () => {
    const r = verifyLegislationContent(
      makeFile({ body: `# ${TITLE}\n1. טקסט.\n<script>ads()</script>` }),
    );
    expect(r.checks.find((c) => c.id === 'L3-no-chrome')?.ok).toBe(false);
  });

  it('L4: fails on mojibake (low Hebrew ratio)', () => {
    // A wrong charset (windows-1255 decoded as UTF-8) turns the WHOLE body —
    // title included — into latin gibberish, so Hebrew ratio collapses.
    const r = verifyLegislationContent(
      makeFile({ body: '# garbled mojibake title\nfull latin gibberish body with no hebrew' }),
    );
    expect(r.checks.find((c) => c.id === 'L4-hebrew-ratio')?.ok).toBe(false);
  });

  it('L2: warns (does not fail) on a section-number gap', () => {
    const r = verifyLegislationContent(
      makeFile({
        body: `# ${TITLE}\n1. טקסט ראשון.\n2. טקסט שני.\n5. טקסט חמישי (3-4 בוטלו).`,
      }),
    );
    expect(r.warnings.some((w) => w.includes('gap'))).toBe(true);
  });
});

describe('liveTokenDiff — L1 live cross-check', () => {
  const body = '# כותרת\n1. טקסט ראשון של החוק.\n2. טקסט שני.';
  it('reports identical when the saved body matches a fresh permissive extraction', () => {
    const liveHtml = '<h1>כותרת</h1><p>1. טקסט ראשון של החוק.</p><p>2. טקסט שני.</p>';
    const r = liveTokenDiff(body, liveHtml);
    expect(r.identical).toBe(true);
    expect(r.firstDivergence).toBe(-1);
  });

  it('reports divergence when the live text changed', () => {
    const liveHtml = '<h1>כותרת</h1><p>1. טקסט ראשון שונה לגמרי.</p><p>2. טקסט שני.</p>';
    const r = liveTokenDiff(body, liveHtml);
    expect(r.identical).toBe(false);
    expect(r.firstDivergence).toBeGreaterThanOrEqual(0);
  });
});
