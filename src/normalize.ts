import type { Compensation, CompensationKind } from './types';

export const WORKING_HOURS_PER_MONTH = 160;

const AMOUNT_PATTERN = /(\d+(?:\.\d+)?)(万|千)?/g;
const SEPARATOR = /[〜~-]/;
const UNIT_MULTIPLIER: Record<string, number> = { 万: 10_000, 千: 1_000 };
const HOURLY_PATTERN = /時給|時間単価|円\/時|\/h/i;
const MONTHLY_PATTERN = /月額|月給|月収|円\/月|\/月/;
const FOREIGN_CURRENCY_PATTERN = /\$|ドル|usd/i;

interface Bounds {
  min: number | null;
  max: number | null;
}

interface Token {
  value: number;
  unit: string | undefined;
  index: number;
}

/** 換算できないものは 0 や中央値で埋めず、不明・未取得として返す。 */
function unknownCompensation(): Compensation {
  return { kind: '不明', min: null, max: null, currency: 'JPY', estimateFlags: ['未取得'] };
}

function detectKind(text: string): CompensationKind | null {
  const hourly = HOURLY_PATTERN.test(text);
  const monthly = MONTHLY_PATTERN.test(text);
  if (hourly && monthly) return null;
  if (hourly) return '時給';
  return monthly ? '月額' : '固定';
}

function tokenize(text: string): Token[] {
  return [...text.matchAll(AMOUNT_PATTERN)].map((m) => ({
    value: Number(m[1]),
    unit: m[2],
    index: m.index ?? 0,
  }));
}

function toYen(token: Token, unit = token.unit): number {
  return Math.round(token.value * (unit ? UNIT_MULTIPLIER[unit] : 1));
}

function singleBounds(text: string, token: Token): Bounds {
  const yen = toYen(token);
  const sepIndex = text.search(SEPARATOR);
  if (/以上/.test(text) || (sepIndex >= 0 && sepIndex > token.index)) return { min: yen, max: null };
  if (/以下|以内|まで/.test(text) || (sepIndex >= 0 && sepIndex < token.index)) return { min: null, max: yen };
  return { min: yen, max: yen };
}

/** 「5〜10万円」のように片方にだけ単位があるときは、小さい側に単位を引き継ぐ。 */
function rangeBounds(low: Token, high: Token): Bounds | null {
  const shareUnit = !low.unit && high.unit && low.value < high.value;
  const min = toYen(low, shareUnit ? high.unit : low.unit);
  const max = toYen(high);
  return min <= max ? { min, max } : null;
}

function resolveBounds(text: string): Bounds | null {
  const tokens = tokenize(text);
  if (tokens.length === 1) return singleBounds(text, tokens[0]);
  if (tokens.length === 2 && SEPARATOR.test(text)) return rangeBounds(tokens[0], tokens[1]);
  return null;
}

export function normalizeCompensation(raw: string | null): Compensation {
  if (!raw) return unknownCompensation();
  const text = raw.normalize('NFKC').replace(/[,\s]/g, '');
  if (!text.includes('円') || FOREIGN_CURRENCY_PATTERN.test(text)) return unknownCompensation();
  const kind = detectKind(text);
  const bounds = kind ? resolveBounds(text) : null;
  if (!kind || !bounds) return unknownCompensation();
  return { kind, ...bounds, currency: 'JPY', estimateFlags: [] };
}

/** 月額→時間単価は仮定（月160時間）に基づくので、必ず「推定」を立てる。 */
export function monthlyToHourly(
  compensation: Compensation,
  hoursPerMonth = WORKING_HOURS_PER_MONTH,
): Compensation {
  if (compensation.kind !== '月額') return compensation;
  const perHour = (yen: number | null) => (yen === null ? null : Math.round(yen / hoursPerMonth));
  const flags = new Set(compensation.estimateFlags).add('推定');
  return {
    ...compensation,
    kind: '時給',
    min: perHour(compensation.min),
    max: perHour(compensation.max),
    estimateFlags: [...flags],
  };
}
