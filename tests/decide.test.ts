import { describe, expect, it } from 'vitest';
import {
  MIN_FIXED_YEN,
  MIN_HOURLY_YEN,
  REVIEW_CONFIDENCE_THRESHOLD,
  decide,
} from '../src/decide';
import type { Action, Compensation, CompensationKind } from '../src/types';

const NOW = new Date('2026-10-14T12:00:00+09:00');

const comp = (kind: CompensationKind, min: number | null, max: number | null): Compensation => ({
  kind,
  min,
  max,
  currency: 'JPY',
  estimateFlags: kind === '不明' ? ['未取得'] : [],
});

const run = (
  overrides: { confidence?: number; compensation?: Compensation; deadline?: string | null } = {},
) =>
  decide(
    {
      confidence: 0.9,
      compensation: comp('時給', 5000, 5000),
      deadline: null,
      ...overrides,
    },
    NOW,
  );

describe('decide: 確信度', () => {
  it.each<[number, Action]>([
    [1, '通知する'],
    [REVIEW_CONFIDENCE_THRESHOLD, '通知する'],
    [REVIEW_CONFIDENCE_THRESHOLD - 0.01, '要確認'],
    [0, '要確認'],
  ])('確信度 %s は %s', (confidence, action) => {
    expect(run({ confidence }).action).toBe(action);
  });

  it('確信度が低ければ、報酬が基準未満でも捨てずに要確認にする', () => {
    expect(run({ confidence: 0.3, compensation: comp('時給', 1000, 1000) }).action).toBe('要確認');
  });

  it('確信度が低ければ、締切切れでも捨てずに要確認にする', () => {
    expect(run({ confidence: 0.3, deadline: '2026-10-01' }).action).toBe('要確認');
  });
});

describe('decide: 報酬', () => {
  it.each<[string, Compensation, Action]>([
    ['時給が下限ちょうど', comp('時給', MIN_HOURLY_YEN, MIN_HOURLY_YEN), '通知する'],
    ['時給が下限未満', comp('時給', MIN_HOURLY_YEN - 1, MIN_HOURLY_YEN - 1), '捨てる'],
    ['時給の幅の上限が基準以上', comp('時給', 1000, 5000), '通知する'],
    ['時給の幅の上限が基準未満', comp('時給', 1000, 2000), '捨てる'],
    ['下限だけの記載で基準以上', comp('時給', 4000, null), '通知する'],
    ['固定が下限ちょうど', comp('固定', MIN_FIXED_YEN, MIN_FIXED_YEN), '通知する'],
    ['固定が下限未満', comp('固定', MIN_FIXED_YEN - 1, MIN_FIXED_YEN - 1), '捨てる'],
    ['月額→3,750円/時', comp('月額', 600000, 600000), '通知する'],
    ['月額→2,500円/時', comp('月額', 400000, 400000), '捨てる'],
    ['報酬が不明', comp('不明', null, null), '要確認'],
  ])('%s', (_name, compensation, action) => {
    expect(run({ compensation }).action).toBe(action);
  });

  it('月額からの判断には推定を含むことを理由に残す', () => {
    const result = run({ compensation: comp('月額', 600000, 600000) });
    expect(result.reasons.join()).toContain('推定');
  });

  it('時給の判断に推定の理由は付かない', () => {
    expect(run().reasons).toEqual([]);
  });
});

describe('decide: 締切', () => {
  it.each<[string, string, Action, boolean]>([
    ['過ぎている', '2026-10-13', '捨てる', false],
    ['今日（日本時間の終わりまで有効）', '2026-10-14', '通知する', true],
    ['明日', '2026-10-15', '通知する', true],
    ['3日後', '2026-10-17', '通知する', false],
    ['形式が不正', '来週', '要確認', false],
    ['存在しない日付', '2026-13-45', '要確認', false],
  ])('%s', (_name, deadline, action, urgent) => {
    const result = run({ deadline });
    expect([result.action, result.urgent]).toEqual([action, urgent]);
  });

  it('締切なしは緊急扱いにしない', () => {
    expect(run({ deadline: null }).urgent).toBe(false);
  });

  it('捨てる・要確認のときは緊急扱いにしない', () => {
    const result = run({ deadline: '2026-10-15', compensation: comp('不明', null, null) });
    expect([result.action, result.urgent]).toEqual(['要確認', false]);
  });
});
