/**
 * src/lib/import/strip-nevo-html.ts — deterministic, NON-GENERATIVE extraction
 * of an Israeli legislation text from a Nevo `law_html` page into clean markdown.
 *
 * ⚠️ Pure. No I/O, no network, no AI. Deterministic: same HTML → same output.
 *
 * WHY deterministic-not-AI: this corpus is the citation source-of-truth. A model
 * (WebFetch's small model, or an agent) can paraphrase/truncate legal text —
 * unacceptable. A regex tag-stripper is NON-GENERATIVE: it can only drop text (a
 * wrong selector) or keep extra chrome (incomplete strip) — it physically cannot
 * reword or invent. So "verbatim" reduces to (a) lossless transform and (b)
 * correct body boundaries + no chrome.
 *
 * TWO Nevo templates are handled:
 *  A) modern: <h1> title + <h6> margin-titles + <p> body (most pages).
 *  B) legacy Word-export: NO heading tags; title in <title> + a styled <span>;
 *     a Nevo subject-breadcrumb precedes the law text.
 * Both are normalised by anchoring the body on the TITLE: the region starts at
 * <h1> (A) or <body> (B), and the emitted body + the L1 check are aligned on the
 * first occurrence of the title token-sequence (dropping B's breadcrumb chrome).
 *
 * L1 — zero-loss token round-trip (the verbatim guarantee, asserted internally):
 *   the emitted markdown body must be token-identical (Hebrew words + numbers) to
 *   a permissive "drop ALL tags" extraction of the same region, aligned from the
 *   title. If the transform ever dropped/added/reordered a token this throws
 *   `LosslessViolationError` at the exact divergence. (Proven on scope 2.3.)
 *
 * Honest limit: this verifies fidelity to Nevo's "נוסח עדכני" (consolidated
 * text), NOT to the binding records (רשומות). See LEGISLATION-SOURCES.md.
 */

/** Result of stripping one Nevo law page. */
export interface StripNevoResult {
  /** Title — the `<h1>` text, else the `<title>` tag text. */
  readonly title: string;
  /** Version date from "נוסח עדכני נכון ליום: …", ISO `YYYY-MM-DD` if parseable; else null. */
  readonly versionDate: string | null;
  /** Clean markdown body, verbatim (title as `#`, margin-titles as `##`). */
  readonly body: string;
  /** Count of `##` heading lines (margin-titles). */
  readonly headingCount: number;
  /** Leading section numbers found at paragraph starts (`^N.`), in order — for L2 continuity. */
  readonly sectionNumbers: readonly number[];
  /**
   * Count of embedded base64 content-images in the body. Nevo serves appendix
   * tables / forms / figures / formulas as <img src="data:image…"> (NOT text),
   * so a non-zero count means the `.md` text is INCOMPLETE (the binding Drive PDF
   * has them). Drives `source_complete:false` + an auto `gap_note`.
   */
  readonly imageCount: number;
  /** The heading/sentence immediately preceding each content-image (for the gap_note). */
  readonly imageContexts: readonly string[];
}

/** Thrown when the structural extraction is not token-identical to the permissive one (L1). */
export class LosslessViolationError extends Error {
  constructor(
    readonly position: number,
    readonly permissiveToken: string | undefined,
    readonly structuralToken: string | undefined,
    readonly permissiveLength: number,
    readonly structuralLength: number,
  ) {
    super(
      `L1 zero-loss violation at token #${position}: ` +
        `permissive=${JSON.stringify(permissiveToken)} vs structural=${JSON.stringify(structuralToken)} ` +
        `(lengths ${permissiveLength} vs ${structuralLength})`,
    );
    this.name = 'LosslessViolationError';
  }
}

/** Hebrew-word / number tokenizer. Ignores punctuation, whitespace, markdown markers. */
export function tokenize(text: string): string[] {
  return text.match(/[֐-׿]+|\d+/g) ?? [];
}

/** Decode the HTML entities that appear in Nevo pages (named + numeric dec/hex). */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&thinsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rlm;/g, '‏')
    .replace(/&lrm;/g, '‎')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // &amp; LAST so a literal "&amp;lt;" isn't double-decoded.
}

/** Remove `<script>/<style>/<!-- -->` chrome. Text-preserving everywhere else. */
function removeChrome(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
}

/** Strip inline tags, decode entities, collapse whitespace — for a title/heading fragment. */
function cleanInline(htmlFragment: string): string {
  return decodeEntities(htmlFragment.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** First index of a contiguous token subsequence `needle` within `haystack`, or -1. */
function indexOfSubsequence(haystack: readonly string[], needle: readonly string[]): number {
  if (needle.length === 0) return 0;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let match = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * PERMISSIVE extraction: drop EVERY tag, keep every text character. This is the
 * independent reference the structural output is checked against (L1).
 */
export function permissiveText(htmlBodyRegion: string): string {
  return decodeEntities(htmlBodyRegion.replace(/<[^>]+>/g, ' '))
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

/** Extract & ISO-normalise the "נוסח עדכני נכון ליום: DD-MM-YYYY" version date. */
function extractVersionDate(html: string): string | null {
  const m = html.match(/נוסח עדכני נכון ליום:?\s*(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
}

/** Leading section numbers at paragraph starts (`^N.` / `^Nא.`), in document order. */
function extractSectionNumbers(lines: readonly string[]): number[] {
  const nums: number[] = [];
  for (const line of lines) {
    const body = line.replace(/^##\s*/, '');
    const m = body.match(/^(\d{1,3})[֐-׿]?\s*\./);
    if (m) nums.push(Number(m[1]));
  }
  return nums;
}

/** Map a region's heading/paragraph tags to markdown lines (text-preserving). */
function toStructuralLines(region: string): string[] {
  const raw = decodeEntities(
    region
      .replace(/<h1[^>]*>/gi, '\n# ')
      .replace(/<h[2-6][^>]*>/gi, '\n## ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  return raw
    .split('\n')
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^#{1,2}$/.test(l)); // drop bare "#"/"##" (Nevo anchor wrappers)
}

/**
 * Detect embedded base64 content-images (Nevo serves appendices/figures/formulas
 * as <img src="data:image…">). Returns the count + the cleaned text preceding
 * each (its heading/sentence) — used to auto-generate the gap_note.
 */
function detectContentImages(html: string): { count: number; contexts: string[] } {
  const re = /<img\b[^>]*src=["']data:image\/[^"']+["'][^>]*>/gi;
  const contexts: string[] = [];
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    count += 1;
    const before = decodeEntities(
      html.slice(Math.max(0, m.index - 260), m.index).replace(/<[^>]+>/g, ' '),
    )
      .replace(/[A-Za-z0-9+/=]{16,}/g, ' ') // drop base64 tails of preceding images
      .replace(/\s+/g, ' ')
      .trim()
      .slice(-90);
    // Keep only contexts that are real Hebrew heading/text (base64 is ASCII-only).
    if (/[א-ת]/.test(before) && !contexts.includes(before)) contexts.push(before);
  }
  return { count, contexts };
}

/** Find the body-region start: `<h1>` (template A), else `<body>` (template B), else 0. */
function regionStartIndex(htmlNoChrome: string): number {
  const h1 = htmlNoChrome.search(/<h1[\s>]/i);
  if (h1 >= 0) return h1;
  const body = htmlNoChrome.search(/<body[\s>]/i);
  return body >= 0 ? body : 0;
}

/** The aligned permissive token stream of a page's legal body (for the live L1 diff). */
export function legalTokensFromHtml(html: string): string[] {
  const noChrome = removeChrome(html);
  const region = noChrome.slice(regionStartIndex(noChrome));
  const h1Match = noChrome.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = noChrome.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanInline(h1Match?.[1] ?? titleMatch?.[1] ?? '');
  const titleTokens = tokenize(title);
  const all = tokenize(permissiveText(region));
  const start = titleTokens.length ? indexOfSubsequence(all, titleTokens) : 0;
  return start >= 0 ? all.slice(start) : all;
}

/**
 * Strip one Nevo `law_html` page to clean, verbatim markdown.
 * Throws `LosslessViolationError` if the structural transform is not
 * token-identical to the permissive reference (the L1 verbatim guarantee).
 */
export function stripNevoHtml(html: string): StripNevoResult {
  const noChrome = removeChrome(html);
  const versionDate = extractVersionDate(noChrome);

  // Title: prefer <h1> (template A); else <title> tag (template B).
  const h1Match = noChrome.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleTagMatch = noChrome.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanInline(h1Match?.[1] ?? titleTagMatch?.[1] ?? '');
  const titleTokens = tokenize(title);

  const region = noChrome.slice(regionStartIndex(noChrome));
  let lines = toStructuralLines(region);

  // Template B (no <h1> heading): promote the title line to `# `, drop the
  // Nevo breadcrumb chrome that precedes it.
  if (!lines[0]?.startsWith('# ') && titleTokens.length) {
    const ti = lines.findIndex((l) => indexOfSubsequence(tokenize(l), titleTokens) === 0);
    if (ti >= 0) {
      lines = lines.slice(ti);
      lines[0] = `# ${lines[0]}`;
    } else {
      lines = [`# ${title}`, ...lines];
    }
  }
  const body = lines.join('\n');

  // ── L1: zero-loss token round-trip, aligned from the title occurrence ──
  const permAll = tokenize(permissiveText(region));
  const startTok = titleTokens.length ? indexOfSubsequence(permAll, titleTokens) : 0;
  const permissiveTokens = startTok >= 0 ? permAll.slice(startTok) : permAll;
  const structuralTokens = tokenize(body);
  const n = Math.max(permissiveTokens.length, structuralTokens.length);
  for (let i = 0; i < n; i += 1) {
    if (permissiveTokens[i] !== structuralTokens[i]) {
      throw new LosslessViolationError(
        i,
        permissiveTokens[i],
        structuralTokens[i],
        permissiveTokens.length,
        structuralTokens.length,
      );
    }
  }

  const images = detectContentImages(region);

  return {
    title,
    versionDate,
    body,
    headingCount: lines.filter((l) => l.startsWith('## ')).length,
    sectionNumbers: extractSectionNumbers(lines),
    imageCount: images.count,
    imageContexts: images.contexts,
  };
}
