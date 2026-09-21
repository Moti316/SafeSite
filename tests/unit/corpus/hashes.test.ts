/**
 * נעילת הקורפוס: הנוסחים בריפו זהים למה שנחתם ב-HASHES.json.
 * כשל כאן = נוסח חוק השתנה בלי שמישהו עדכן את הנעילה במכוון.
 */

import { describe, expect, it } from 'vitest';

import {
  computeCorpusHashes,
  diffHashes,
  readLockedHashes,
} from '../../../scripts/corpus-hashes.ts';

describe('נעילת קורפוס החקיקה', () => {
  it('כל נוסח תואם ל-hash הנעול', () => {
    expect(diffHashes(readLockedHashes(), computeCorpusHashes())).toEqual({
      changed: [],
      added: [],
      removed: [],
    });
  });

  it('43 נוסחי חקיקה נעולים', () => {
    const laws = Object.keys(readLockedHashes()).filter((f) => f.includes('/'));
    expect(laws).toHaveLength(43);
  });

  it('diffHashes מבחין בין שינוי, תוספת ומחיקה', () => {
    const locked = { 'a.md': '1', 'b.md': '2' };
    const now = { 'a.md': '9', 'c.md': '3' };
    expect(diffHashes(locked, now)).toEqual({ changed: ['a.md'], added: ['c.md'], removed: ['b.md'] });
  });
});
