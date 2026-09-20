/**
 * scripts/legislation-manifest.ts — the legislation download/cross-reference
 * manifest for the safety-officer course (consumed by `scripts/fetch-legislation.ts`).
 *
 * ⚠️ SERVER-ONLY, no secrets — only public Nevo URLs + Google-Drive file-IDs
 * (public-within-the-account identifiers, not credentials).
 *
 * SOURCE-OF-TRUTH split:
 * - This TS manifest is the single cross-reference linking, per scope:
 *     scope ↔ Nevo URL ↔ repo `.md` (verbatim working text) ↔ Drive PDF (binding) ↔ curriculum depth.
 * - `courses/safety-officer/LEGISLATION-SOURCES.md` = human catalog.
 * - `courses/safety-officer/sources/legislation/INDEX.md` = GENERATED map (from this manifest).
 * - `tests/unit/import/legislation-manifest.test.ts` asserts 0-drift.
 *
 * THREE asset layers per item (no re-transcription — see A2.1 plan):
 * - `.md` (repo): Nevo "נוסח עדכני" verbatim TEXT — RAG + citation-locator. Image
 *   appendices/tables/figures are NOT in the text (Nevo embeds them as PNG) —
 *   flagged `source_complete:false` automatically by the image detector.
 * - `driveFileId` (Drive folder "חוקים ותקנות"): the official PDF — binding
 *   source-of-truth, COMPLETE (appendices included). `authoritative_source` in
 *   each `.md` frontmatter points here. Creator-gated (auth-required).
 * - Curriculum (doc 905018, מינהל-הבטיחות): defines scope; `depth` tier below.
 *
 * SKIPPED (no standalone text): 2.11 (covered in 2.0). 5.x ISO standards
 * (paywalled). The 3 items 2.8.1 / 4.3.2 / 4.3.3 were added 2026-06-03 after
 * the official curriculum (905018) named them. 2.6.1 (עגורני-צריח תשכ"ז-1966)
 * was added 2026-06-11 (A2 research corrected the "covered by 2.6" mixup —
 * tower-crane regs ARE a standalone text, ~102 regs incl. reg.65).
 */

import { isValidScopeId } from '../src/lib/db/constants/scope-refs';

/** The four downloadable chapter directories under sources/legislation/. */
export type ChapterDir = '1-irgun-hapikuach' | '2-pkudat-habetihut' | '3-gehut' | '4-hukei-ezer';

/** Curriculum depth tier (per official program 905018). All are IN the curriculum. */
export type Depth = 'core' | 'framework' | 'topic';

/** One legislation source. */
export interface LegislationSource {
  /** Canonical committee scope id (must satisfy isValidScopeId). */
  readonly scopeId: string;
  /** LEGISLATION-SOURCES sub-label when it differs from a canonical id (e.g. '2.10b','2.8.1'). */
  readonly subId?: string;
  /** kebab-case slug: transliterated keyword + Gregorian year. */
  readonly slug: string;
  /** Target chapter directory. */
  readonly chapterDir: ChapterDir;
  /** Full Nevo law_html URL. */
  readonly url: string;
  /** Official title (verbatim from Nevo) — used for the L3 title cross-check. */
  readonly officialTitle: string;
  /** Google-Drive file-id of the official PDF (binding source-of-truth, folder "חוקים ותקנות"). */
  readonly driveFileId?: string;
  /** TRUE only while the binding PDF awaits manual upload to Drive (then replaced by driveFileId). */
  readonly drivePdfPending?: true;
  /** Curriculum depth tier (905018): core role/legislation · framework cross-cutting · topic branch/agent-specific. */
  readonly depth: Depth;
  /** Extra scope ids this single text also satisfies (no standalone text of their own). */
  readonly covers?: readonly string[];
  /** Charset override for a known-non-UTF-8 page (detection handles the rest). */
  readonly charsetHint?: 'utf-8' | 'windows-1255';
}

const NEVO = 'https://www.nevo.co.il/law_html/';

/** Drive folder "חוקים ותקנות" (root) + the official curriculum doc 905018 (scope-defining). */
export const DRIVE_LEGISLATION_FOLDER_ID = '1lCKYQifQ1oKdq0XylmufpoyIY7UnfkRo';
export const CURRICULUM_DOC_FILE_ID = '1nmxUOfUnm8wIkWy7_ecsnRXr8zhkf6F0'; // "תוכנית לימודים משרד העבודה" (מינהל-הבטיחות 905018)

/** Drive "view" URL for a PDF file-id. */
export function driveUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** The 43 legislation sources (39 + 2.8.1 + 4.3.2 + 4.3.3 per curriculum 905018, + 2.6.1 per A2 2026-06-11). */
export const LEGISLATION_SOURCES: readonly LegislationSource[] = [
  // ── Chapter 1 — חוק ארגון הפיקוח + תקנות (scope 1.x) ──
  {
    scopeId: '1.0',
    slug: 'irgun-hapikuach-1954',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law00/74395.htm`,
    officialTitle: 'חוק ארגון הפיקוח על העבודה, תשי"ד-1954',
    driveFileId: '1XMtN2JpcBAmqvLOQDdgN2q2UiqdqH7h7',
    depth: 'core',
  },
  {
    scopeId: '1.1',
    slug: 'memunim-betihut-1996',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law01/026_009.htm`,
    officialTitle: 'תקנות ארגון הפיקוח על העבודה (ממונים על הבטיחות), תשנ"ו-1996',
    driveFileId: '10J3QCNzt-mSnW9hN6vnD72Nl_kkLAW9p',
    depth: 'core',
  },
  {
    scopeId: '1.2',
    slug: 'tochnit-nihul-betihut-2013',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law00/121241.htm`,
    officialTitle: 'תקנות ארגון הפיקוח על העבודה (תכנית לניהול הבטיחות), תשע"ג-2013',
    driveFileId: '1PhiL92Oh_P29z-TVOdTk_Z5zFN9aBjgP',
    depth: 'core',
  },
  {
    scopeId: '1.3',
    slug: 'mesirat-meyda-hadracha-1999',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law00/74400.htm`,
    officialTitle: 'תקנות ארגון הפיקוח על העבודה (מסירת מידע והדרכת עובדים), תשנ"ט-1999',
    driveFileId: '1X2tQAupszlmkjAnB1j9KH7JRugSZm-fd',
    depth: 'core',
  },
  {
    scopeId: '1.4',
    slug: 'vaadot-neemanei-betihut-1960',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law00/74396.htm`,
    officialTitle: 'תקנות ארגון הפיקוח על העבודה (ועדות בטיחות ונאמני בטיחות), תשכ"א-1960',
    driveFileId: '1nCDF1mc9xCdIsKa11rCMxIOMX38NN7IJ',
    depth: 'core',
  },
  {
    scopeId: '1.5',
    slug: 'teunot-machalot-mishlach-yad-1945',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law01/p228_001.htm`,
    officialTitle: 'פקודת תאונות ומחלות משלח-יד (הודעה), 1945',
    driveFileId: '15bvQ3jP4NFbxU6pCw3_B3FamlIismmot',
    depth: 'core',
  },
  {
    scopeId: '1.5.1',
    slug: 'teunot-machalot-hodaa-1951',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law01/p228_002.htm`,
    officialTitle:
      'תקנות התאונות ומחלות משלח-היד (הודעה על מקרים מסוכנים במקומות עבודה), תשי"א-1951',
    driveFileId: '1ArxQjBqtErkl5XXd-n-sQuJBhEjNyG6y',
    depth: 'framework',
  },
  {
    scopeId: '1.5.2',
    slug: 'machalot-miktzoa-hodaa-1980',
    chapterDir: '1-irgun-hapikuach',
    url: `${NEVO}law01/p228_003.htm`,
    officialTitle: 'תקנות מחלות מקצוע (חובת הודעה — רשימה נוספת), תש"ם-1980',
    driveFileId: '1T8xxWozEgAMjRCJ51Wp5K8SkDqU1zloP',
    depth: 'framework',
  },

  // ── Chapter 2 — פקודת הבטיחות + תקנות (scope 2.x) ──
  {
    scopeId: '2.0',
    slug: 'pkudat-habetihut-1970',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74793.htm`,
    officialTitle: 'פקודת הבטיחות בעבודה [נוסח חדש], תש"ל-1970',
    driveFileId: '1-AeN5_ZSzS08XklNwS-DYqrnxsPdCFv-',
    depth: 'core',
    covers: ['2.11'],
  },
  {
    scopeId: '2.1',
    slug: 'avoda-begova-2007',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74164.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עבודה בגובה), תשס"ז-2007',
    driveFileId: '1QQZ8ltKN4wQY7RxNFHaxnbqfBX-lj6PD',
    depth: 'framework',
  },
  {
    scopeId: '2.2',
    slug: 'avodot-bniya-1988',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74821.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עבודות בניה), תשמ"ח-1988',
    driveFileId: '1CIcEqJ92KUhQ_Kb4tlRE7gzEFmOTvidg',
    depth: 'framework',
  },
  {
    scopeId: '2.3',
    slug: 'tziyud-magen-ishi-1997',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74835.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (ציוד מגן אישי), תשנ"ז-1997',
    driveFileId: '1mPVDYMA2B1wjmiXK_vMzsQJfcemqpp9j',
    depth: 'framework',
  },
  {
    scopeId: '2.4',
    slug: 'chashmal-1990',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74824.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (חשמל), תש"ן-1990',
    driveFileId: '1_z74d2627CWM4uIU23QnPNNs73vNvFMP',
    depth: 'framework',
  },
  {
    scopeId: '2.4.1',
    slug: 'chashmal-mitkan-chai-2014',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law01/500_998.htm`,
    officialTitle: 'תקנות החשמל (עבודה במיתקן חי או בקרבתו), תשע"ד-2014',
    driveFileId: '1F-tKkp_x2f3MOuvKC17AEihKIeO-HhAi',
    depth: 'topic',
  },
  {
    scopeId: '2.4.2',
    slug: 'chashmal-mitkan-arai-2002',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law01/999_062.htm`,
    officialTitle:
      'תקנות החשמל (מיתקן חשמלי ארעי באתר בניה במתח שאינו עולה על מתח נמוך), תשס"ג-2002',
    driveFileId: '1-Ai8QFflRse2IHD6dtdWYFP_tUxvrtq5',
    depth: 'topic',
  },
  {
    scopeId: '2.5',
    slug: 'ezra-rishona-1988',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74822.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עזרה ראשונה במקומות עבודה), תשמ"ח-1988',
    driveFileId: '19A6By8Xfvdv5GT1PU_sIn9jWuk1VOgdF',
    depth: 'framework',
  },
  {
    scopeId: '2.6',
    slug: 'agoranaim-atatim-1992',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law01/051_049.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עגורנאים, מפעילי מכונות הרמה אחרות ואתתים), תשנ"ג-1992',
    driveFileId: '1WVE1pfnPvWYgbxmjAh64nq2EAAute0wa',
    depth: 'framework',
  },
  {
    // A2 2026-06-11: standalone text (הקמה · בודק-מוסמך · תסקיר · reg.65 איסור-הרמת-אדם).
    // Binding PDF staged at .cache/nevo — awaiting Moti's drag into Drive "תקנות".
    scopeId: '2.6.1',
    slug: 'agoranei-tsriach-1966',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74805.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עגורני-צריח), תשכ"ז-1966',
    drivePdfPending: true,
    depth: 'topic',
  },
  {
    scopeId: '2.6.2',
    slug: 'haramat-bnei-adam-malgazot-1983',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74809.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (הרמת בני אדם במלגזות), תשמ"ג-1983',
    driveFileId: '1YuU3phlrKZuU0fGhKZt6ZHp3I6s7UYsX',
    depth: 'topic',
  },
  {
    scopeId: '2.7',
    slug: 'gilyon-betihut-sds-1998',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74836.htm`,
    officialTitle:
      'תקנות הבטיחות בעבודה (גיליון בטיחות, סיווג, אריזה, תיווי וסימון של אריזות), תשנ"ח-1998',
    driveFileId: '1geTHUX3uVGeDrf4_M3tJiocd6cxKxVVv',
    depth: 'framework',
  },
  {
    scopeId: '2.8',
    slug: 'mechonot-haklaiyot-1988',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74823.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (בטיחות במכונות חקלאיות), תשמ"ח-1988',
    driveFileId: '1n26xdB8BJe5QL5rnk4OFUTDEG8uVgX7i',
    depth: 'topic',
  },
  {
    scopeId: '2.8',
    subId: '2.8.1',
    slug: 'traktorim-chaklaut-1972',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74806.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (טרקטורים בחקלאות), תשל"ב-1972',
    driveFileId: '1uYf0benA7GGwYXNBZcZewI6oMfxeyMrM',
    depth: 'topic',
  },
  {
    scopeId: '2.9',
    slug: 'avoda-gagot-shvirim-1986',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74818.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עבודה על גגות שבירים או תלולים), תשמ"ו-1986',
    driveFileId: '1JWx5EiKtDPhR-LGoGF_6lDsBqW3B5O5v',
    depth: 'topic',
  },
  {
    scopeId: '2.10',
    slug: 'dod-kitor-2000',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/74837.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (מפעיל דוד קיטור ודוד הסקה), התש"ס-2000',
    driveFileId: '1VjniGa0Hs3gGgm08j48Oq94Y7Y9lbOEI',
    depth: 'topic',
  },
  {
    scopeId: '2.10',
    subId: '2.10b',
    slug: 'bdikat-mitkanei-lachatz-1967',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law00/40532.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (בדיקת מיתקני לחץ), תשכ"ז-1967',
    driveFileId: '13JH1DtxftBwWPKfm8thsqUQ1SsVirzcW',
    depth: 'topic',
  },
  {
    scopeId: '2.11.1',
    slug: 'tichnun-vehabniya-1965',
    chapterDir: '2-pkudat-habetihut',
    url: `${NEVO}law01/044_001.htm`,
    officialTitle: 'חוק התכנון והבניה, תשכ"ה-1965',
    driveFileId: '1Ol3HAlmMyD7U_Zb2GWECi2DJxjW4uX1X',
    depth: 'topic',
  },

  // ── Chapter 3 — תקנות גהות (scope 3.x) ──
  {
    scopeId: '3.1',
    slug: 'nitur-svivati-biologi-2011',
    chapterDir: '3-gehut',
    url: `${NEVO}law01/500_552.htm`,
    officialTitle:
      'תקנות הבטיחות בעבודה (ניטור סביבתי וניטור ביולוגי של עובדים בגורמים מזיקים), תשע"א-2011',
    driveFileId: '1j8uZZsJofWaE_pXI_ySwJO3W97vop6fN',
    depth: 'framework',
  },
  {
    scopeId: '3.2',
    slug: 'gehut-raash-1984',
    chapterDir: '3-gehut',
    url: `${NEVO}law00/74815.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (גיהות תעסוקתית ובריאות העובדים ברעש), תשמ"ד-1984',
    driveFileId: '1pMJX5WN8_NtCZZ_D5fwjzrGX-yqdXprL',
    depth: 'topic',
  },
  {
    scopeId: '3.3',
    slug: 'gehut-avak-mazik-1984',
    chapterDir: '3-gehut',
    url: `${NEVO}law01/051_033.htm`,
    officialTitle:
      'תקנות הבטיחות בעבודה (גיהות תעסוקתית ובריאות הציבור והעובדים באבק מזיק), תשמ"ד-1984',
    driveFileId: '1b8RKGiBraV1e2a5AEa33L_3aAxrDBZjV',
    depth: 'topic',
  },
  {
    scopeId: '3.4',
    slug: 'gehut-krina-minenet-1992',
    chapterDir: '3-gehut',
    url: `${NEVO}law01/051_047.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (גיהות תעסוקתית ובריאות העוסקים בקרינה מיננת), תשנ"ג-1992',
    driveFileId: '1ROveIOZqEZYOvXrl55j06sjMzCcxCNaw',
    depth: 'topic',
  },
  {
    scopeId: '3.5.1',
    slug: 'gehut-benzen-1983',
    chapterDir: '3-gehut',
    url: `${NEVO}law01/051_032.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (גיהות תעסוקתית ובריאות העובדים בבנזן), תשמ"ד-1983',
    driveFileId: '1CybpXGZhb7SQp83OczUNxlNGhIspAYm4',
    depth: 'topic',
  },
  {
    scopeId: '3.5.2',
    slug: 'gehut-kaspit-1985',
    chapterDir: '3-gehut',
    url: `${NEVO}law00/74817.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (גיהות תעסוקתית ובריאות העובדים בכספית), תשמ"ה-1985',
    driveFileId: '1lLPw94huFutTDDSR-jRF3ACMCnNgItYy',
    depth: 'topic',
  },
  {
    scopeId: '3.5.3',
    slug: 'chomrei-hadbara-1964',
    chapterDir: '3-gehut',
    url: `${NEVO}law00/74799.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (עובדים בחמרי הדברה), תשכ"ד-1964',
    driveFileId: '1lXeUsAupcKSfrkv9TuvFkDkAUkLz48Rj',
    depth: 'topic',
  },
  {
    scopeId: '3.6',
    slug: 'gehut-maabadot-2001',
    chapterDir: '3-gehut',
    url: `${NEVO}law00/74839.htm`,
    officialTitle:
      'תקנות הבטיחות בעבודה (בטיחות וגיהות תעסוקתית בעבודה עם גורמים מסוכנים במעבדות רפואיות, כימיות וביולוגיות), תשס"א-2001',
    driveFileId: '1cn2vD74MyDqg3nrUhYz8tggW3pyyNA_n',
    depth: 'topic',
  },
  {
    scopeId: '3.7',
    slug: 'gehut-krinat-laser-2005',
    chapterDir: '3-gehut',
    url: `${NEVO}law00/73936.htm`,
    officialTitle: 'תקנות הבטיחות בעבודה (גיהות תעסוקתית ובטיחות העוסקים בקרינת לייזר), תשס"ה-2005',
    driveFileId: '1mHJX2Ywi0MOO2hYBIYTyJoCp8_LzVrIE',
    depth: 'topic',
  },

  // ── Chapter 4 — חוקי-עזר (scope 4.x) ──
  {
    scopeId: '4.1',
    slug: 'avodat-nashim-1954',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law00/74249.htm`,
    officialTitle: 'חוק עבודת נשים, תשי"ד-1954',
    driveFileId: '1UJQ55BWzJ_pynsjX5vc98e1wkQTE98st',
    depth: 'framework',
  },
  {
    scopeId: '4.2',
    slug: 'avodat-hanoar-1953',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law00/4273.htm`,
    officialTitle: 'חוק עבודת הנוער, תשי"ג-1953',
    driveFileId: '1QXOS2Aaog5mX3qTIKU5EOUtWD5cwdKY4',
    depth: 'framework',
  },
  {
    scopeId: '4.3',
    slug: 'rishuy-asakim-1968',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law01/p212m1_001.htm`,
    officialTitle: 'חוק רישוי עסקים, תשכ"ח-1968',
    driveFileId: '1gYNN-r257iALw5nqX3BHVX5kFiglM8y9',
    depth: 'framework',
  },
  {
    scopeId: '4.3.1',
    slug: 'rishuy-asakim-achsanat-neft-1976',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law00/4865.htm`,
    officialTitle: 'תקנות רישוי עסקים (אחסנת נפט), תשל"ז-1976',
    driveFileId: '1W5gsc0konW8LXZp-ACSc6XsxC5-wY4gr',
    depth: 'topic',
  },
  {
    scopeId: '4.3',
    subId: '4.3.2',
    slug: 'tzav-rishuy-asakim-2013',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law00/121269.htm`,
    officialTitle: 'צו רישוי עסקים (עסקים טעוני רישוי), תשע"ג-2013',
    driveFileId: '1r9p3ZhRA0dLiqMYBi3LdQA2xNihz0Kv3',
    depth: 'framework',
  },
  {
    scopeId: '4.3',
    subId: '4.3.3',
    slug: 'rishuy-asakim-horaot-klaliot-2000',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law01/p212m1_033.htm`,
    officialTitle: 'תקנות רישוי עסקים (הוראות כלליות), תשס"א-2000',
    driveFileId: '11oPBi8ShJ_oVGvat-qKrcPnw99C918T7',
    depth: 'framework',
  },
  {
    scopeId: '4.4',
    slug: 'chomarim-mesukanim-1993',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law01/154_001.htm`,
    officialTitle: 'חוק החמרים המסוכנים, תשנ"ג-1993',
    driveFileId: '1TTDr7EsgaUQipX_fonjLx9vl-PLLbtxr',
    depth: 'framework',
  },
  {
    scopeId: '4.5',
    slug: 'chok-hagaz-1989',
    chapterDir: '4-hukei-ezer',
    url: `${NEVO}law01/058_001.htm`,
    officialTitle: 'חוק הגז (בטיחות ורישוי), תשמ"ט-1989',
    driveFileId: '1ZvJEypltO2B9Dozx3fyDqoo15-_pbD4p',
    depth: 'topic',
  },
] as const;

/** Output filename: `<subId|scopeId>-<slug>.md` (subId disambiguates a scope's multiple texts). */
export function fileNameFor(s: LegislationSource): string {
  return `${s.subId ?? s.scopeId}-${s.slug}.md`;
}

/** Repo-relative output path for a source. */
export function relPathFor(s: LegislationSource): string {
  return `courses/safety-officer/sources/legislation/${s.chapterDir}/${fileNameFor(s)}`;
}

/** Validate the manifest at module-load (fail fast on a typo'd scope/dup slug/missing drive id). */
export function validateManifest(
  sources: readonly LegislationSource[] = LEGISLATION_SOURCES,
): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const urls = new Set<string>();
  const fileNames = new Set<string>();
  const driveIds = new Set<string>();
  for (const s of sources) {
    if (!isValidScopeId(s.scopeId)) errors.push(`invalid canonical scopeId: ${s.scopeId}`);
    const fn = fileNameFor(s);
    if (fileNames.has(fn)) errors.push(`duplicate filename: ${fn}`);
    fileNames.add(fn);
    if (slugs.has(s.slug)) errors.push(`duplicate slug: ${s.slug}`);
    slugs.add(s.slug);
    if (urls.has(s.url)) errors.push(`duplicate url: ${s.url}`);
    urls.add(s.url);
    if (!/^https:\/\/www\.nevo\.co\.il\/law_html\//.test(s.url)) {
      errors.push(`unexpected url host: ${s.url}`);
    }
    if (s.drivePdfPending) {
      if (s.driveFileId !== undefined) {
        errors.push(`drivePdfPending with driveFileId for ${s.scopeId} — pick one`);
      }
    } else if (!s.driveFileId || !/^[A-Za-z0-9_-]{20,}$/.test(s.driveFileId)) {
      errors.push(`invalid driveFileId for ${s.scopeId}: ${s.driveFileId}`);
    }
    if (s.driveFileId) {
      if (driveIds.has(s.driveFileId)) errors.push(`duplicate driveFileId: ${s.driveFileId}`);
      driveIds.add(s.driveFileId);
    }
  }
  return errors;
}
