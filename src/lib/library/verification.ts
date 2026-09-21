/**
 * src/lib/library/verification.ts — תוצאות אימות מסוכן דפדפן מול נבו ומאגר החקיקה.
 *
 * אימות אינו אישור (R16): הוא רק מסמן לממונה על מה לעבור. הקובץ שהסוכן מחזיר הוא
 * פלט של מודל שקרא אתרי אינטרנט — כלומר קלט לא מהימן (25-AI-SECURITY §3). לכן
 * הוא נבדק כאן לפי סכמה קשיחה, ואף שדה בו לא משנה טיוטה או אישור.
 */

import type { DraftBatch } from './drafts';

export const VERDICTS = ['תואם', 'סטייה', 'לא נמצא', 'דורש ממונה'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface VerifiedItem {
  id: string;
  verdict: Verdict;
  checks: Partial<Record<'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6', boolean>>;
  source_url?: string;
  found_text?: string;
  comment?: string;
}

export interface VerificationLaw {
  scope: string;
  nevo_version_date?: string;
  matches_our_version?: boolean;
  amendments_after_our_version?: string[];
  in_force?: boolean;
  notes?: string;
}

export interface Verification {
  verified_on: string;
  verifier: string;
  laws: VerificationLaw[];
  items: VerifiedItem[];
  not_drafted?: { candidate: string; agree: boolean; comment?: string }[];
  page_instructions_ignored?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRUSTED_HOSTS = ['www.nevo.co.il', 'nevo.co.il', 'main.knesset.gov.il', 'www.gov.il', 'gov.il', 'www.knesset.gov.il'];

/** מאמת את מבנה הקובץ מול האצוות. מחזיר רשימת הפרות; ריקה = תקין. */
export function validateVerification(v: unknown, batches: DraftBatch[]): string[] {
  const errors: string[] = [];
  if (typeof v !== 'object' || v === null) return ['הקובץ אינו אובייקט JSON'];
  const x = v as Partial<Verification>;
  if (!ISO_DATE.test(x.verified_on ?? '')) errors.push('verified_on אינו תאריך YYYY-MM-DD');
  if (!x.verifier) errors.push('verifier חסר');
  if (!Array.isArray(x.items)) return [...errors, 'items חסר'];

  const known = new Set(batches.flatMap((b) => b.items.map((i) => i.id)));
  const seen = new Set<string>();
  for (const it of x.items) {
    const at = it?.id ?? '(בלי מזהה)';
    if (!known.has(it.id)) errors.push(`${at}: מזהה שאינו באף אצווה`);
    if (seen.has(it.id)) errors.push(`${at}: מופיע פעמיים`);
    seen.add(it.id);
    if (!VERDICTS.includes(it.verdict)) errors.push(`${at}: verdict "${String(it.verdict)}" אינו מהרשימה`);
    if (it.verdict !== 'תואם' && !it.comment?.trim()) errors.push(`${at}: "${it.verdict}" בלי הסבר`);
    if (it.source_url) {
      let host = '';
      try { host = new URL(it.source_url).host; } catch { errors.push(`${at}: source_url לא תקין`); }
      if (host && !TRUSTED_HOSTS.includes(host)) errors.push(`${at}: מקור מחוץ לנבו/הכנסת/gov.il — ${host}`);
    }
  }
  return errors;
}

/** אילו סעיפים דורשים את עיני הממונה: כל מה שאינו "תואם", וכל מה שלא נבדק. */
export function flaggedIds(v: Verification, batch: DraftBatch): string[] {
  const byId = new Map(v.items.map((i) => [i.id, i]));
  return batch.items.filter((i) => byId.get(i.id)?.verdict !== 'תואם').map((i) => i.id);
}
