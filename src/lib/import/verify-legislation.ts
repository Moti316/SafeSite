/**
 * src/lib/import/verify-legislation.ts — deterministic fidelity checks for a
 * fetched legislation `.md` file (the corpus QA gate).
 *
 * ⚠️ Pure. No network in the core checker (`verifyLegislationContent`). The live
 * cross-check (`liveTokenDiff`) is a separate helper the caller feeds re-fetched
 * HTML into — it imports only the pure tokenizer from strip-nevo-html.
 *
 * Layers (see strip-nevo-html.ts for L1's in-extractor guarantee):
 * - L2 — section-number continuity (warning, not hard-fail: repealed sections
 *   create legit gaps, so we report gaps rather than reject).
 * - L3 — boundaries + no-chrome: body starts at `# <title>`, frontmatter title
 *   matches the `#` H1 and (fuzzily) the manifest's official title, and no
 *   script/ad/footer chrome leaked into the body.
 * - L4 — charset/Hebrew integrity: Hebrew-letter ratio ≥ threshold (catches
 *   windows-1255 mojibake decoded as UTF-8).
 * - L5 — frontmatter: required keys present, valid scope id, filename matches.
 * - L1 (live) — `liveTokenDiff`: the saved body must be token-identical to a
 *   permissive extraction of a FRESHLY re-fetched page (catches Nevo updating
 *   the נוסח after we cached, and re-proves losslessness vs an independent fetch).
 */

import { isValidScopeId } from '../db/constants/scope-refs';
import { tokenize, legalTokensFromHtml } from './strip-nevo-html';

/** One named check outcome. */
export interface CheckResult {
  readonly id: string;
  readonly ok: boolean;
  readonly detail?: string;
}

/** Aggregate verification result for one file. */
export interface VerifyResult {
  readonly ok: boolean;
  readonly checks: readonly CheckResult[];
  readonly warnings: readonly string[];
  readonly frontmatter: Readonly<Record<string, string>>;
}

/** Required frontmatter keys (version_date may be the literal "null"). */
const REQUIRED_KEYS = [
  'scope_id',
  'title',
  'source',
  'source_url',
  'version_date',
  'fetch_date',
  'license',
  'authoritative_source',
  'section_count',
] as const;

/** Chrome signatures that must NEVER appear in a clean legal body. */
const CHROME_PATTERNS: readonly RegExp[] = [
  /adsbygoogle/i,
  /<script/i,
  /<style/i,
  /<defenition/i,
  /function\s*\(/,
  /כל הזכויות שמורות/,
  /נבו הוצאה לאור/,
  /©/,
];

/** Minimum Hebrew-letter ratio of body letters (catches mojibake). */
const MIN_HEBREW_RATIO = 0.3;

/** Split a `.md` file into its frontmatter map and body. Tolerant line parser (no YAML dep). */
export function splitFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!kv) continue;
    let value = kv[2]!.trim();
    // Strip one layer of surrounding quotes and unescape (round-trips with the
    // fetch script's YAML writer): double-quoted unescapes \" and \\;
    // single-quoted un-doubles ''.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    fm[kv[1]!] = value;
  }
  return { frontmatter: fm, body: (m[2] ?? '').trim() };
}

/** Normalise a title for fuzzy comparison (collapse spaces, unify quote + dash glyphs). */
function normalizeTitle(s: string): string {
  return s
    .replace(/[״"]/g, '"')
    .replace(/[׳']/g, "'")
    .replace(/[־–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Do two titles align? Token-based (punctuation-insensitive): the shorter token
 * sequence must be a prefix of the longer. Tolerates a Nevo footnote marker
 * ("[1]") or hyphen/en-dash nuance, but rejects a genuinely different title.
 */
function titlesAlign(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((tok, i) => tok === long[i]);
}

/** Jaccard token-overlap of two titles (0..1) — for the official-title cross-check. */
function titleOverlap(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

/** Leading section numbers at paragraph starts (`^N.` / `^Nא.`). */
function sectionNumbers(body: string): number[] {
  const nums: number[] = [];
  for (const line of body.split('\n')) {
    const m = line.replace(/^##\s*/, '').match(/^(\d{1,3})[֐-׿]?\s*\./);
    if (m) nums.push(Number(m[1]));
  }
  return nums;
}

/**
 * Ratio of REAL Hebrew letters (א–ת, U+05D0–U+05EA) over all letters. Counting
 * only letters — NOT the whole [֐-׿] block (which includes geresh/gershayim
 * punctuation) — is what makes windows-1255 mojibake (geresh soup) score low.
 */
function hebrewRatio(text: string): number {
  const hebrew = (text.match(/[א-ת]/g) ?? []).length;
  const letters = (text.match(/[\p{L}]/gu) ?? []).length;
  return letters === 0 ? 0 : hebrew / letters;
}

export interface VerifyOptions {
  /** Output filename (for the L5 filename check + messages). */
  readonly fileName?: string;
  /** Manifest official title (for the L3 fuzzy title cross-check). */
  readonly officialTitle?: string;
  /** Manifest canonical scope id (for the L5 scope check). */
  readonly expectedScopeId?: string;
}

/** Run L2–L5 over the content of one fetched legislation `.md` file. */
export function verifyLegislationContent(content: string, opts: VerifyOptions = {}): VerifyResult {
  const { frontmatter, body } = splitFrontmatter(content);
  const checks: CheckResult[] = [];
  const warnings: string[] = [];

  // ── L5: frontmatter ──
  const missing = REQUIRED_KEYS.filter((k) => !(k in frontmatter));
  checks.push({
    id: 'L5-frontmatter-keys',
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(', ')}` : undefined,
  });

  const scopeId = frontmatter.scope_id ?? '';
  checks.push({
    id: 'L5-valid-scope',
    ok: isValidScopeId(scopeId),
    detail: isValidScopeId(scopeId) ? undefined : `invalid scope_id: ${scopeId}`,
  });
  if (opts.expectedScopeId && scopeId !== opts.expectedScopeId) {
    checks.push({
      id: 'L5-scope-matches-manifest',
      ok: false,
      detail: `frontmatter ${scopeId} ≠ manifest ${opts.expectedScopeId}`,
    });
  }
  if (opts.fileName) {
    checks.push({
      id: 'L5-filename',
      ok: /^[\d.a-z]+-[a-z0-9-]+\.md$/.test(opts.fileName),
      detail: opts.fileName,
    });
  }

  // ── L3: boundaries + title ──
  const h1Raw = body.match(/^#\s+(.+)$/m)?.[1] ?? '';
  const fmTitle = normalizeTitle(frontmatter.title ?? '');
  const h1ok = h1Raw.length > 0 && titlesAlign(h1Raw, frontmatter.title ?? '');
  checks.push({
    id: 'L3-title-h1-matches-frontmatter',
    ok: h1ok,
    detail: h1ok ? undefined : `H1 "${normalizeTitle(h1Raw)}" ≠ frontmatter "${fmTitle}"`,
  });
  if (opts.officialTitle) {
    // Token-overlap (not strict equality): tolerant of spacing/punctuation
    // transcription nuance, but catches a WRONG page (low overlap).
    const overlap = titleOverlap(fmTitle, normalizeTitle(opts.officialTitle));
    checks.push({
      id: 'L3-title-matches-official',
      ok: overlap >= 0.8,
      detail: `overlap ${overlap.toFixed(2)} vs official "${normalizeTitle(opts.officialTitle)}"`,
    });
  }

  const chromeHit = CHROME_PATTERNS.find((re) => re.test(body));
  checks.push({
    id: 'L3-no-chrome',
    ok: !chromeHit,
    detail: chromeHit ? `chrome leaked: ${chromeHit}` : undefined,
  });

  // ── L4: Hebrew integrity ──
  const ratio = hebrewRatio(body);
  checks.push({
    id: 'L4-hebrew-ratio',
    ok: ratio >= MIN_HEBREW_RATIO,
    detail: `hebrew ratio ${ratio.toFixed(2)} (min ${MIN_HEBREW_RATIO})`,
  });

  // ── L2: section continuity (warning only — repealed sections create gaps) ──
  const nums = sectionNumbers(body);
  const declared = Number(frontmatter.section_count ?? '0');
  if (nums.length === 0 && declared > 0) {
    warnings.push('L2: no section numbers parsed though section_count > 0');
  }
  const maxN = nums.length ? Math.max(...nums) : 0;
  const present = new Set(nums);
  const gaps: number[] = [];
  for (let i = 1; i < maxN; i += 1) if (!present.has(i)) gaps.push(i);
  if (gaps.length) warnings.push(`L2: section-number gaps (likely repealed): ${gaps.join(', ')}`);

  // Source-completeness: image-embedded content (Nevo serves appendices/figures
  // as base64 PNG — not text-extractable; the binding Drive PDF has the full text).
  if (frontmatter.source_complete === 'false') {
    warnings.push(
      `source incomplete (image-embedded content): ${frontmatter.gap_note ?? '(no note)'}`,
    );
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
    warnings,
    frontmatter,
  };
}

/** Result of the live token-diff cross-check (L1 vs a fresh fetch). */
export interface LiveDiffResult {
  readonly identical: boolean;
  /** First diverging token index, or -1 if identical up to the shorter length. */
  readonly firstDivergence: number;
  readonly savedTokenCount: number;
  readonly liveTokenCount: number;
}

/**
 * L1 live cross-check: compare the saved body's tokens against the title-aligned
 * permissive tokens of a FRESHLY re-fetched page (`legalTokensFromHtml` applies
 * the same template-A/B anchoring the extractor uses). A divergence means Nevo's
 * text changed since we cached.
 */
export function liveTokenDiff(savedBody: string, liveHtml: string): LiveDiffResult {
  const saved = tokenize(savedBody);
  const live = legalTokensFromHtml(liveHtml);
  const n = Math.min(saved.length, live.length);
  let firstDivergence = -1;
  for (let i = 0; i < n; i += 1) {
    if (saved[i] !== live[i]) {
      firstDivergence = i;
      break;
    }
  }
  const identical = firstDivergence === -1 && saved.length === live.length;
  return {
    identical,
    firstDivergence,
    savedTokenCount: saved.length,
    liveTokenCount: live.length,
  };
}
