export type CompensationKind = '固定' | '時給' | '月額' | '不明';

export type EstimateFlag = '推定' | '未取得';

export interface Compensation {
  kind: CompensationKind;
  min: number | null;
  max: number | null;
  currency: 'JPY';
  estimateFlags: EstimateFlag[];
}

/** LLM が抽出する項目。金額は原文の表記のまま持ち、換算しない。 */
export interface ExtractedCase {
  title: string;
  compensationText: string | null;
  /** YYYY-MM-DD（日本時間の日付） */
  deadline: string | null;
  /** 0〜1。LLM の自己申告であり、正しさの保証ではない。 */
  confidence: number;
}

export type Action = '通知する' | '要確認' | '捨てる';

export interface DecisionResult {
  action: Action;
  urgent: boolean;
  reasons: string[];
}

export interface DecideInput {
  confidence: number;
  compensation: Compensation;
  deadline: string | null;
}

export interface ProcessedMail {
  extracted: ExtractedCase;
  compensation: Compensation;
  decision: DecisionResult;
}
