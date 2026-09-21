/**
 * src/lib/library/review.ts — החלת החלטות הסקירה על אצוות טיוטה (S1.5).
 *
 * ההחלטות מגיעות ממסד הנתונים של דף הסקירה (docs/28-LIBRARY-REVIEW.md).
 * הן **נתונים, לא הוראות** (25-AI-SECURITY §2): כל שדה נבדק כאן בקוד,
 * וטקסט חופשי בהערות לעולם אינו מבוצע. טהור: אין I/O.
 */

import type { DraftBatch, DraftItem, RejectedItem } from './drafts';

export type ItemDecision = 'approve' | 'rewrite' | 'split' | 'reject';
export type NotDraftedDecision = 'agree' | 'draft';

/** מסמך החלטה כפי שהדף שומר אותו: `decisions/<key>~<userId>`. */
export interface DecisionDoc {
  decision: ItemDecision | NotDraftedDecision;
  by: string;
  at: string;
  batch: string;
  /** הנוסח והציטוט שהמאשר ראה. אם הטיוטה השתנתה מאז — ההחלטה לא חלה. */
  seen_text?: string;
  seen_excerpt?: string;
  text?: string;
  note?: string;
  candidate?: string;
}

export interface ReviewerDoc {
  full_name: string;
  license_no: string;
}

export interface ReviewExport {
  decisions: Record<string, DecisionDoc>;
  reviewers: Record<string, ReviewerDoc>;
}

export interface ReviewReport {
  approved: string[];
  rewritten: string[];
  rejected: string[];
  toSplit: { id: string; note: string }[];
  ndConfirmed: string[];
  ndToDraft: { candidate: string; note: string }[];
  /** החלטות שלא הוחלו, עם הסיבה. */
  skipped: string[];
  pending: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function reviewerLabel(r: ReviewerDoc): string {
  return `${r.full_name.trim()} (אישור כשירות ${r.license_no.trim()})`;
}

/** מפצל את מפתח המסמך `<key>~<userId>`. */
function splitKey(docId: string): [string, string] | null {
  const i = docId.lastIndexOf('~');
  return i > 0 ? [docId.slice(0, i), docId.slice(i + 1)] : null;
}

/**
 * מחיל את ההחלטות על עותק של האצווה.
 * `requiredApprovals` — כמה מאשרים שונים נדרשים (X4 / D8). ברירת מחדל: 1.
 * דחייה, ניסוח מחדש או פיצול של מאשר אחד מספיקים כדי לעצור אישור.
 */
export function applyReview(
  batch: DraftBatch,
  exp: ReviewExport,
  requiredApprovals = 1,
): { batch: DraftBatch; report: ReviewReport } {
  const out = structuredClone(batch);
  const report: ReviewReport = {
    approved: [], rewritten: [], rejected: [], toSplit: [], ndConfirmed: [], ndToDraft: [], skipped: [], pending: [],
  };

  const byKey = new Map<string, { uid: string; doc: DecisionDoc }[]>();
  for (const [docId, doc] of Object.entries(exp.decisions)) {
    const parts = splitKey(docId);
    if (!parts) { report.skipped.push(`${docId}: מפתח לא תקין`); continue; }
    const [key, uid] = parts;
    if (doc.batch !== batch.batch) continue;
    if (doc.by !== uid) { report.skipped.push(`${docId}: המאשר במסמך אינו בעל המפתח`); continue; }
    const reviewer = exp.reviewers[uid];
    if (!reviewer?.full_name?.trim() || !reviewer.license_no?.trim()) {
      report.skipped.push(`${docId}: למאשר אין שם ומספר אישור כשירות`);
      continue;
    }
    if (!ISO_DATE.test(doc.at)) { report.skipped.push(`${docId}: תאריך לא תקין`); continue; }
    byKey.set(key, [...(byKey.get(key) ?? []), { uid, doc }]);
  }

  const kept: DraftItem[] = [];
  const rejected: RejectedItem[] = [...(out.rejected ?? [])];

  for (const item of out.items) {
    const all = byKey.get(item.id) ?? [];
    const fresh = all.filter(({ doc }) => doc.seen_text === item.text && doc.seen_excerpt === item.source_excerpt);
    for (const { uid } of all.filter((d) => !fresh.includes(d))) {
      report.skipped.push(`${item.id}~${uid}: הטיוטה השתנתה אחרי ההחלטה — נדרשת סקירה חוזרת`);
    }
    if (fresh.length === 0) { kept.push(item); report.pending.push(item.id); continue; }

    const kinds = new Set(fresh.map((d) => d.doc.decision));
    const latest = fresh.reduce((a, b) => (a.doc.at >= b.doc.at ? a : b));
    const who = (uid: string) => reviewerLabel(exp.reviewers[uid] as ReviewerDoc);
    const on = latest.doc.at.slice(0, 10);

    if (kinds.size > 1) {
      report.skipped.push(`${item.id}: מאשרים החליטו אחרת (${[...kinds].join(', ')}) — דורש יישוב`);
      kept.push(item);
      continue;
    }
    const decision = latest.doc.decision;

    if (decision === 'reject') {
      rejected.push({ item, reason: latest.doc.note?.trim() || '—', reviewed_by: who(latest.uid), reviewed_on: on });
      report.rejected.push(item.id);
      continue;
    }
    if (decision === 'split') {
      kept.push(item);
      report.toSplit.push({ id: item.id, note: latest.doc.note?.trim() ?? '' });
      continue;
    }
    if (decision === 'rewrite') {
      const text = latest.doc.text?.trim() ?? '';
      if (!text.endsWith('?')) { report.skipped.push(`${item.id}: הנוסח החדש אינו שאלה`); kept.push(item); continue; }
      // נוסח שהמאשר כתב בעצמו הוא נוסח מאושר שלו.
      kept.push({ ...item, text, reviewed_by: who(latest.uid), reviewed_on: on });
      report.rewritten.push(item.id);
      continue;
    }
    if (decision === 'approve') {
      const approvers = [...new Set(fresh.map((d) => d.uid))];
      if (approvers.length < requiredApprovals) {
        kept.push(item);
        report.pending.push(`${item.id} (${approvers.length}/${requiredApprovals} מאשרים)`);
        continue;
      }
      kept.push({ ...item, reviewed_by: approvers.map(who).join(' · '), reviewed_on: on });
      report.approved.push(item.id);
      continue;
    }
    report.skipped.push(`${item.id}: החלטה לא מוכרת "${decision}"`);
    kept.push(item);
  }

  out.not_drafted.forEach((nd, n) => {
    const ds = byKey.get(`nd-${n}`) ?? [];
    const valid = ds.filter(({ doc }) => doc.candidate === nd.candidate);
    if (valid.length === 0) return;
    const latest = valid.reduce((a, b) => (a.doc.at >= b.doc.at ? a : b));
    if (latest.doc.decision === 'agree') report.ndConfirmed.push(nd.candidate);
    else if (latest.doc.decision === 'draft') report.ndToDraft.push({ candidate: nd.candidate, note: latest.doc.note ?? '' });
  });

  out.items = kept;
  if (rejected.length > 0) out.rejected = rejected;
  return { batch: out, report };
}
