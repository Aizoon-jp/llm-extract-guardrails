export interface Config {
  anthropicApiKey: string;
  model: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** 環境変数を読む唯一の場所。未設定なら黙ってフォールバックせず止める。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicApiKey) {
    throw new Error('環境変数 ANTHROPIC_API_KEY が未設定です');
  }
  return { anthropicApiKey, model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL };
}
