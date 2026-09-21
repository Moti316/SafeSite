/**
 * tests/unit/import/legislation-manifest.test.ts
 *
 * Guards the 43-item legislation manifest: every canonical scopeId is valid,
 * slugs/urls/filenames are unique, chapter dirs match the scope chapter, and the
 * special cases (2.10's two texts, the `covers` back-references) hold. This is
 * the 0-drift gate against scope-refs.ts and the A2 plan.
 */

import { describe, expect, it } from 'vitest';
import {
  LEGISLATION_SOURCES,
  validateManifest,
  fileNameFor,
  relPathFor,
  type ChapterDir,
} from '../../../scripts/legislation-manifest';
import { isValidScopeId } from '@/lib/db/constants/scope-refs';

const CHAPTER_DIRS: readonly ChapterDir[] = [
  '1-irgun-hapikuach',
  '2-pkudat-habetihut',
  '3-gehut',
  '4-hukei-ezer',
];

describe('legislation manifest — shape', () => {
  it('has exactly 43 sources (39 + 2.8.1 + 4.3.2 + 4.3.3 + 2.6.1 agoranei-tsriach)', () => {
    expect(LEGISLATION_SOURCES.length).toBe(43);
  });

  it('passes the built-in validator (valid scopes, unique slug/url/filename/driveFileId)', () => {
    expect(validateManifest()).toEqual([]);
  });

  it('every source has a Drive PDF file-id (or an explicit pending flag) + a depth tier', () => {
    for (const s of LEGISLATION_SOURCES) {
      if (s.drivePdfPending) {
        expect(s.driveFileId, `pending ${s.scopeId} must not carry an id`).toBeUndefined();
      } else {
        expect(s.driveFileId, `driveFileId ${s.scopeId}`).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      }
      expect(['core', 'framework', 'topic'], `depth ${s.scopeId}`).toContain(s.depth);
    }
  });

  it('only 2.6.1 is pending a Drive PDF (shrinks to none once Moti uploads)', () => {
    const pending = LEGISLATION_SOURCES.filter((s) => s.drivePdfPending);
    expect(pending.map((s) => s.scopeId)).toEqual(['2.6.1']);
  });

  it('every canonical scopeId is a known committee scope', () => {
    for (const s of LEGISLATION_SOURCES) {
      expect(isValidScopeId(s.scopeId), `scopeId ${s.scopeId}`).toBe(true);
    }
  });
});

describe('legislation manifest — chapters & naming', () => {
  it('every chapterDir is one of the four known directories', () => {
    for (const s of LEGISLATION_SOURCES) {
      expect(CHAPTER_DIRS).toContain(s.chapterDir);
    }
  });

  it('chapterDir matches the scope chapter (1.x→1-, 2.x→2-, 3.x→3-, 4.x→4-)', () => {
    for (const s of LEGISLATION_SOURCES) {
      const chapter = s.scopeId.split('.')[0];
      expect(s.chapterDir.startsWith(`${chapter}-`), `${s.scopeId} → ${s.chapterDir}`).toBe(true);
    }
  });

  it('slugs end with a Gregorian year and are kebab-case', () => {
    for (const s of LEGISLATION_SOURCES) {
      expect(s.slug, s.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{4}$/);
    }
  });

  it('filename is `<subId|scopeId>-<slug>.md` and lands under the chapter dir', () => {
    const s = LEGISLATION_SOURCES.find((x) => x.subId === '2.10b')!;
    expect(fileNameFor(s)).toBe('2.10b-bdikat-mitkanei-lachatz-1967.md');
    expect(relPathFor(s)).toBe(
      'data/legislation/2-pkudat-habetihut/2.10b-bdikat-mitkanei-lachatz-1967.md',
    );
  });
});

describe('legislation manifest — special cases', () => {
  it('canonical scope 2.10 has two texts (2.10 + 2.10b) without filename collision', () => {
    const tens = LEGISLATION_SOURCES.filter((s) => s.scopeId === '2.10');
    expect(tens.length).toBe(2);
    const files = new Set(tens.map(fileNameFor));
    expect(files.size).toBe(2);
  });

  it('the ordinance 2.0 records covers:[2.11] (no standalone elevator text)', () => {
    const ordinance = LEGISLATION_SOURCES.find((s) => s.scopeId === '2.0')!;
    expect(ordinance.covers).toContain('2.11');
  });

  it('2.6.1 (tower cranes 1966) is a standalone text — 2.6 no longer claims to cover it', () => {
    const towerCranes = LEGISLATION_SOURCES.find((s) => s.scopeId === '2.6.1')!;
    expect(towerCranes.url).toContain('74805');
    expect(towerCranes.officialTitle).toContain('עגורני-צריח');
    const operators = LEGISLATION_SOURCES.find((s) => s.scopeId === '2.6')!;
    expect(operators.covers ?? []).not.toContain('2.6.1');
  });

  it('does NOT include the skipped narrow elevator-door regulation (74832)', () => {
    expect(LEGISLATION_SOURCES.some((s) => s.url.includes('74832'))).toBe(false);
  });

  it('re-fetches 1.5.1 and 2.5 as .md (uniform corpus)', () => {
    expect(LEGISLATION_SOURCES.some((s) => s.scopeId === '1.5.1')).toBe(true);
    expect(LEGISLATION_SOURCES.some((s) => s.scopeId === '2.5')).toBe(true);
  });

  it("1.5.1 official title carries Nevo's full form (במקומות עבודה)", () => {
    const s = LEGISLATION_SOURCES.find((x) => x.scopeId === '1.5.1')!;
    expect(s.officialTitle).toContain('במקומות עבודה');
  });

  it('includes the 3 curriculum-mandated additions (2.8.1, 4.3.2, 4.3.3)', () => {
    const ids = new Set(LEGISLATION_SOURCES.map((s) => s.subId ?? s.scopeId));
    expect(ids.has('2.8.1')).toBe(true); // tractors-in-agriculture
    expect(ids.has('4.3.2')).toBe(true); // business-licensing order
    expect(ids.has('4.3.3')).toBe(true); // business-licensing general regs
  });

  it('scope 2.8 has 2 texts (machines + tractors) and 4.3 has 3 (law + order + general)', () => {
    expect(LEGISLATION_SOURCES.filter((s) => s.scopeId === '2.8').length).toBe(2);
    expect(LEGISLATION_SOURCES.filter((s) => s.scopeId === '4.3').length).toBe(3);
  });
});
