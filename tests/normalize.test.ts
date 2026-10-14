import { describe, expect, it } from 'vitest';
import { WORKING_HOURS_PER_MONTH, monthlyToHourly, normalizeCompensation } from '../src/normalize';
import type { Compensation, CompensationKind } from '../src/types';

const make = (kind: CompensationKind, min: number | null, max: number | null): Compensation => ({
  kind,
  min,
  max,
  currency: 'JPY',
  estimateFlags: [],
});

const UNKNOWN: Compensation = { kind: '不明', min: null, max: null, currency: 'JPY', estimateFlags: ['未取得'] };

describe('normalizeCompensation', () => {
  it.each([
    ['時給3,000円', make('時給', 3000, 3000)],
    ['時給3000円〜5000円', make('時給', 3000, 5000)],
    ['時給 5,000〜8,000円', make('時給', 5000, 8000)],
    ['時給５，０００円', make('時給', 5000, 5000)],
    ['3000円/時', make('時給', 3000, 3000)],
    ['月額60万円', make('月額', 600000, 600000)],
    ['月額50〜70万円', make('月額', 500000, 700000)],
    ['60万円/月', make('月額', 600000, 600000)],
    ['〜5万円', make('固定', null, 50000)],
    ['~5万円', make('固定', null, 50000)],
    ['5万円〜', make('固定', 50000, null)],
    ['5万円以上', make('固定', 50000, null)],
    ['10万円以下', make('固定', null, 100000)],
    ['5〜10万円', make('固定', 50000, 100000)],
    ['5万円〜10万円', make('固定', 50000, 100000)],
    ['1.5万円', make('固定', 15000, 15000)],
    ['3000〜5万円', make('固定', 3000, 50000)],
    ['30,000円', make('固定', 30000, 30000)],
  ])('%s を正規化する', (raw, expected) => {
    expect(normalizeCompensation(raw)).toEqual(expected);
  });

  it.each([
    ['応相談'],
    ['記載なし'],
    ['要確認'],
    ['要相談（月額）'],
    [''],
    [null],
    ['3名募集'],
    ['時給3000'],
    ['$50/hour'],
    ['50ドル'],
    ['時給3000円または月額50万円'],
    ['1万円と2万円'],
    ['8万円〜5万円'],
  ])('%s は不明・未取得にし、0 や中央値を入れない', (raw) => {
    expect(normalizeCompensation(raw)).toEqual(UNKNOWN);
  });

  it('正規化した値には推定フラグを付けない', () => {
    expect(normalizeCompensation('時給3,000円').estimateFlags).toEqual([]);
  });
});

describe('monthlyToHourly', () => {
  it('月額を時間単価に換算し、必ず推定フラグを立てる', () => {
    expect(monthlyToHourly(make('月額', 600000, 600000))).toEqual({
      ...make('時給', 3750, 3750),
      estimateFlags: ['推定'],
    });
  });

  it('幅を保ち、片側が無い場合は無いまま残す', () => {
    const result = monthlyToHourly(make('月額', 480000, 640000));
    expect([result.min, result.max]).toEqual([3000, 4000]);
    expect(monthlyToHourly(make('月額', 480000, null)).max).toBeNull();
  });

  it('既存のフラグを保ち、推定を重複させない', () => {
    const input = { ...make('月額', 480000, 480000), estimateFlags: ['推定' as const] };
    expect(monthlyToHourly(input).estimateFlags).toEqual(['推定']);
  });

  it('月額以外は変更しない', () => {
    const hourly = make('時給', 3000, 3000);
    expect(monthlyToHourly(hourly)).toBe(hourly);
  });

  it('稼働時間を差し替えられる', () => {
    expect(monthlyToHourly(make('月額', 400000, 400000), 100).min).toBe(4000);
    expect(WORKING_HOURS_PER_MONTH).toBe(160);
  });
});
