import { decide } from './decide';
import { extractCase, type ExtractDeps } from './extract';
import { normalizeCompensation } from './normalize';
import type { ProcessedMail } from './types';

/** LLM は抽出だけ。金額の正規化と通知の判断は決定論のコードで行う。 */
export async function processMail(
  mailBody: string,
  now: Date = new Date(),
  deps?: ExtractDeps,
): Promise<ProcessedMail> {
  const extracted = await extractCase(mailBody, deps);
  const compensation = normalizeCompensation(extracted.compensationText);
  const decision = decide({ confidence: extracted.confidence, compensation, deadline: extracted.deadline }, now);
  return { extracted, compensation, decision };
}
