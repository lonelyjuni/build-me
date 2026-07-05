export interface TocSection {
  id: string;
  title: string;
  status: 'pending' | 'writing' | 'reviewing' | 'completed';
  content: string; // 작성된 실제 본문 (마크다운)
  feedback: string; // 맥킨지 스타일의 비평 피드백
  parentId?: string; // 상위 목차 ID (3.1 → 3)
  isGroupHeader?: boolean; // 하위만 집필하는 그룹 헤더(3.) 여부
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: string;
  type?: 'chat' | 'critique' | 'system_alert' | 'toc_update';
  reasoning?: string; // 에이전트의 추론 과정
  reasoningTime?: number; // 에이전트의 실제 추론 소요 시간 (초)
  actionType?: 'download_wiki';
  contextTokens?: number; // LLM 누적 컨텍스트 사용량 (시스템·대화·응답 합산)
  contextLimit?: number;  // 모델 컨텍스트 윈도우 한도
  outputTokens?: number;  // 이번 응답 출력 토큰 (추정)
  outputTokenLimit?: number; // 모델 출력 토큰 한도
  modelUsed?: string;     // UI 모델 ID (gemma-4-31b 등)
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  apiModelId?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  version?: string;
  used?: number;
  fallbackId?: string;
}

export interface ModelSettings {
  activeProvider: 'gemini' | 'cursor-proxy' | 'cline-pass';
  selectedModelId: string;
  routingEnabled: boolean;
  models: ModelConfig[];
  cursorProxy: {
    baseUrl: string;
    selectedModelId: string;
    models: ModelConfig[];
  };
  clinePass: {
    baseUrl: string;
    selectedModelId: string;
    models: ModelConfig[];
    isAuthenticated: boolean;
    tokenExpiresAt: number;
  };
}

export interface BrainstormSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'interviewing' | 'writing' | 'reviewing' | 'completed';
  toc: TocSection[];
  history: ChatMessage[];
  currentSectionId: string | null; // 현재 초점을 맞추고 있는 목차 섹션 ID
  rawIdea: string; // 사용자가 처음 입력한 거친 아이디어
}

