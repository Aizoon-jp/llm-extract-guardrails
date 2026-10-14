import { monthlyToHourly } from './normalize';
import type { Compensation, DecideInput, DecisionResult } from './types';

export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;
export const MIN_HOURLY_YEN = 3_000;
export const MIN_FIXED_YEN = 30_000;
export const URGENT_DEADLINE_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Verdict = Pick<DecisionResult, 'action' | 'reasons'>;

/** 締切は日本時間のその日の終わりとして扱う。形式が不正なら null。 */
function deadlineEnd(deadline: string): Date | null {
  if (!DATE_PATTERN.test(deadline)) return null;
  const end = new Date(`${deadline}T23:59:59+09:00`);
  return Number.isNaN(end.getTime()) ? null : end;
}

function judgeAmount(compensation: Compensation): Verdict {
  if (compensation.kind === '不明') return { action: '要確認', reasons: ['報酬が不明'] };
  const basis = monthlyToHourly(compensation);
  const upper = basis.max ?? basis.min;
  const floor = basis.kind === '時給' ? MIN_HOURLY_YEN : MIN_FIXED_YEN;
  const note = basis.estimateFlags.includes('推定') ? '（月額からの推定）' : '';
  if (upper !== null && upper < floor) {
    return { action: '捨てる', reasons: [`報酬の上限が下限基準 ${floor} 円未満${note}`] };
  }
  return { action: '通知する', reasons: note ? [`報酬は推定を含む${note}`] : [] };
}

function judgeDeadline(deadline: string | null, now: Date): { verdict: Verdict | null; urgent: boolean } {
  if (deadline === null) return { verdict: null, urgent: false };
  const end = deadlineEnd(deadline);
  if (!end) return { verdict: { action: '要確認', reasons: ['締切の形式が不正'] }, urgent: false };
  const remaining = end.getTime() - now.getTime();
  if (remaining < 0) return { verdict: { action: '捨てる', reasons: ['締切を過ぎている'] }, urgent: false };
  return { verdict: null, urgent: remaining <= URGENT_DEADLINE_DAYS * DAY_MS };
}

/** 純関数。確信度が低ければ他の条件より先に「要確認」にする（信用できない値で捨てない）。 */
export function decide(input: DecideInput, now: Date): DecisionResult {
  if (input.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    return { action: '要確認', urgent: false, reasons: ['抽出の確信度が低い'] };
  }
  const { verdict: deadlineVerdict, urgent } = judgeDeadline(input.deadline, now);
  if (deadlineVerdict) return { ...deadlineVerdict, urgent: false };
  const amount = judgeAmount(input.compensation);
  const reasons = urgent ? [...amount.reasons, '締切が近い'] : amount.reasons;
  return { action: amount.action, urgent: urgent && amount.action === '通知する', reasons };
}
