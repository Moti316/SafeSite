import { describe, expect, it } from 'vitest';

import {
  isValidScopeId,
  SCOPE_CATEGORIES,
  SCOPE_REF_BY_ID,
  SCOPE_REF_IDS,
  SCOPE_REFS,
  SCOPE_REFS_COUNT,
  type ScopeCategory,
} from '@/lib/db/constants/scope-refs';

/**
 * Canonical source-of-truth: the `coverage_tracker` view in
 * `supabase/migrations/0001_initial_schema.sql` (57 scope IDs).
 * These tests lock SCOPE_REFS to that view: 57 items, unique IDs, all 7 categories.
 */
describe('scope-refs — committee scope catalog', () => {
  it('contains exactly 57 scope items (matches coverage_tracker)', () => {
    expect(SCOPE_REFS).toHaveLength(57);
    expect(SCOPE_REFS_COUNT).toBe(57);
  });

  it('has unique scope IDs (no duplicates)', () => {
    const ids = SCOPE_REFS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes a flat ID array consistent with the items', () => {
    expect(SCOPE_REF_IDS).toHaveLength(57);
    expect(SCOPE_REF_IDS).toEqual(SCOPE_REFS.map((s) => s.id));
  });

  it('declares all 7 canonical categories', () => {
    expect(SCOPE_CATEGORIES).toHaveLength(7);
    expect(new Set(SCOPE_CATEGORIES).size).toBe(7);
  });

  it('uses every declared category at least once', () => {
    const usedCategories = new Set(SCOPE_REFS.map((s) => s.category));
    for (const category of SCOPE_CATEGORIES) {
      expect(usedCategories.has(category)).toBe(true);
    }
  });

  it('only uses categories from the canonical list', () => {
    const allowed = new Set<ScopeCategory>(SCOPE_CATEGORIES);
    for (const item of SCOPE_REFS) {
      expect(allowed.has(item.category)).toBe(true);
    }
  });

  it('matches the expected per-category counts from coverage_tracker', () => {
    const counts = SCOPE_REFS.reduce<Record<string, number>>((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      'ארגון הפיקוח': 8,
      'פקודת הבטיחות': 17,
      'גהות + רפואה': 11,
      'חוקים-עזר': 6,
      'תקני ISO': 6,
      'שיטות-ניתוח': 5,
      'גופים-מוסדיים': 4,
    });
  });

  it('gives every item a non-empty Hebrew label', () => {
    for (const item of SCOPE_REFS) {
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('builds a lookup map keyed by every ID', () => {
    expect(SCOPE_REF_BY_ID.size).toBe(57);
    for (const item of SCOPE_REFS) {
      expect(SCOPE_REF_BY_ID.get(item.id)).toEqual(item);
    }
  });

  it('isValidScopeId accepts known IDs and rejects unknown ones', () => {
    expect(isValidScopeId('1.0')).toBe(true);
    expect(isValidScopeId('2.11.1')).toBe(true);
    expect(isValidScopeId('7.4')).toBe(true);
    expect(isValidScopeId('99.9')).toBe(false);
    expect(isValidScopeId('')).toBe(false);
  });
});
