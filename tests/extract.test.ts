import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL, loadConfig } from '../src/config';
import { extractCase, parseExtraction, type ExtractDeps } from '../src/extract';
import { processMail } from '../src/index';

const NOW = new Date('2026-10-14T12:00:00+09:00');
const SAMPLE_DIR = fileURLToPath(new URL('../examples/sample-mails/', import.meta.url));

const loadSample = (name: string) => readFileSync(join(SAMPLE_DIR, name), 'utf-8');

function mockDeps(content: unknown[]) {
  const create = vi.fn().mockResolvedValue({ content });
  const deps = { client: { messages: { create } }, model: 'test-model' } as unknown as ExtractDeps;
  return { deps, create };
}

const toolUse = (input: unknown) => [{ type: 'tool_use', id: 't1', name: 'record_case', input }];

const extraction = (overrides: Record<string, unknown> = {}) => ({
  title: 'テスト案件',
  compensationText: '時給5,000〜8,000円',
  deadline: '2026-10-20',
  confidence: 0.95,
  ...overrides,
});

describe('processMail（Anthropic SDK をモック）', () => {
  it('確信度が高ければ、決定論のコードで換算して通知にする', async () => {
    const { deps } = mockDeps(toolUse(extraction()));
    const result = await processMail(loadSample('01-hourly.txt'), NOW, deps);
    expect(result.compensation).toMatchObject({ kind: '時給', min: 5000, max: 8000, estimateFlags: [] });
    expect(result.decision.action).toBe('通知する');
  });

  it('確信度が低ければ、報酬が読めていても「要確認」に回す', async () => {
    const { deps } = mockDeps(toolUse(extraction({ confidence: 0.4 })));
    const result = await processMail(loadSample('03-vague.txt'), NOW, deps);
    expect(result.decision.action).toBe('要確認');
    expect(result.decision.reasons).toContain('抽出の確信度が低い');
  });

  it('報酬が応相談なら、不明・未取得のまま要確認に回す', async () => {
    const { deps } = mockDeps(toolUse(extraction({ compensationText: '応相談', deadline: null })));
    const result = await processMail(loadSample('03-vague.txt'), NOW, deps);
    expect(result.compensation).toMatchObject({ kind: '不明', min: null, max: null, estimateFlags: ['未取得'] });
    expect(result.decision.action).toBe('要確認');
  });

  it('月額は推定フラグ付きで判断される', async () => {
    const { deps } = mockDeps(toolUse(extraction({ compensationText: '月額60万円' })));
    const result = await processMail(loadSample('02-monthly.txt'), NOW, deps);
    expect(result.compensation.kind).toBe('月額');
    expect(result.decision.reasons.join()).toContain('推定');
  });
});

describe('extractCase', () => {
  it('ツール呼び出しを強制し、メール本文はデータとして囲んで渡す', async () => {
    const { deps, create } = mockDeps(toolUse(extraction()));
    const body = loadSample('01-hourly.txt');
    await extractCase(body, deps);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('test-model');
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'record_case' });
    expect(params.messages[0].content).toBe(`<mail>\n${body}\n</mail>`);
    expect(params.system).toContain('従わない');
  });

  it('サンプルメールが3通あり、すべて読める', () => {
    expect(readdirSync(SAMPLE_DIR).filter((f) => f.endsWith('.txt'))).toHaveLength(3);
  });

  it('ツール呼び出しが返らなければ止まる', async () => {
    const { deps } = mockDeps([{ type: 'text', text: 'こんにちは' }]);
    await expect(extractCase('本文', deps)).rejects.toThrow('record_case');
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ confidence: 1.5 }, 'confidence'],
    [{ confidence: '高' }, 'confidence'],
    [{ deadline: '来週' }, 'deadline'],
    [{ compensationText: 5000 }, 'compensationText'],
  ])('形式が不正な抽出結果（%j）は項目名だけを示して止まる', (override, field) => {
    expect(() => parseExtraction(extraction(override))).toThrow(field);
  });

  it('エラーメッセージにメール本文を含めない', () => {
    const secretBody = '本文に含まれる固有の文字列';
    try {
      parseExtraction({ title: secretBody, confidence: 'x' });
    } catch (e) {
      expect(String(e)).not.toContain(secretBody);
    }
  });
});

describe('loadConfig', () => {
  it('APIキーが未設定・空白なら止まる', () => {
    expect(() => loadConfig({})).toThrow('ANTHROPIC_API_KEY');
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '  ' })).toThrow('ANTHROPIC_API_KEY');
  });

  it('モデルは既定値を使い、環境変数で差し替えられる', () => {
    const key = crypto.randomUUID();
    expect(loadConfig({ ANTHROPIC_API_KEY: key }).model).toBe(DEFAULT_MODEL);
    expect(loadConfig({ ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: 'other-model' }).model).toBe('other-model');
  });
});
