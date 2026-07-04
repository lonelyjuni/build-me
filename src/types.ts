export interface TocSection {
  id: string;
  title: string;
  status: 'pending' | 'writing' | 'reviewing' | 'completed';
  content: string; // 작성된 실제 본문 (마크다운)
  feedback: string; // 맥킨지 스타일의 비평 피드백
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
  contextTokens?: number; // 현재 사용 중인 총 컨텍스트 (토큰 수)
  contextLimit?: number;  // 실제 LLM 모델별 총 컨텍스트 허용량 (토큰 수)
  modelUsed?: string;     // 실제로 호출되어 답변을 생성한 LLM 모델 ID
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  limit: number; // 일일 사용 제한 횟수 (RPD)
  used: number;  // 현재 세션/하루 동안 사용한 횟수
  fallbackId?: string; // 한도 도달 시 대체할 모델 ID
  rpmLimit: number; // 분당 호출 한도 (RPM)
  tpmLimit: string; // 분당 토큰 한도 (TPM)
}

export interface ModelSettings {
  selectedModelId: string;
  routingEnabled: boolean;
  models: ModelConfig[];
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

