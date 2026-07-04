import { ModelConfig } from './types';

/** UI 표시용 모델 ID → 실제 Gemini API 모델 ID */
export const MODEL_API_MAP: Record<string, string> = {
  'gemma-4-31b': 'gemma-4-31b-it',
  'gemma-4-26b': 'gemma-4-26b-a4b-it',
};

export const GEMMA_MODEL_DEFINITIONS: Omit<ModelConfig, 'inputTokenLimit' | 'outputTokenLimit' | 'version'>[] = [
  {
    id: 'gemma-4-31b',
    name: 'Gemma 4 31B',
    description: '구글 Gemma 4 31B IT 모델. API: gemma-4-31b-it',
    used: 0,
    fallbackId: 'gemma-4-26b',
  },
  {
    id: 'gemma-4-26b',
    name: 'Gemma 4 26B',
    description: '구글 Gemma 4 26B A4B IT 모델. API: gemma-4-26b-a4b-it',
    used: 0,
    fallbackId: 'gemma-4-31b',
  },
];

export function buildGemmaModelsFromApi(
  apiModels: Array<{ id: string; inputTokenLimit?: number; outputTokenLimit?: number; version?: string }>
): ModelConfig[] {
  return GEMMA_MODEL_DEFINITIONS.map((def) => {
    const apiId = MODEL_API_MAP[def.id];
    const apiModel = apiModels.find((m) => m.id === apiId);
    return {
      ...def,
      apiModelId: apiId,
      inputTokenLimit: apiModel?.inputTokenLimit ?? 0,
      outputTokenLimit: apiModel?.outputTokenLimit ?? 0,
      version: apiModel?.version,
    };
  });
}
