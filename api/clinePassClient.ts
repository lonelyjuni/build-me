/**
 * Cline Pass OAuth 클라이언트
 *
 * Cline 확장(cline.bot)의 OAuth 인증 흐름을 재사용하여
 * Cline Pass 구독 모델(Qwen3.7 Plus 등)을 BuildMe에서 호출할 수 있게 한다.
 *
 * 주요 흐름:
 * 1) getAuthUrl(callbackUrl)  → Cline 인증 페이지 URL 반환 (Google 로그인)
 * 2) handleCallback(token)     → 콜백 토큰(refreshToken/idToken)을 저장용 토큰셋으로 변환
 * 3) refreshAuthToken(tokenSet)→ refreshToken 으로 새 idToken 발급
 * 4) streamClinePassChat(...)  → OpenAI 호환 /chat/completions 스트리밍
 *
 * 참고: Cline 확장 dist/extension.js 역분석 기반 (2026-07).
 */

export const CLINE_PASS_DEFAULT_BASE_URL =
  process.env.CLINE_PASS_BASE_URL?.trim() || "https://api.cline.bot";

export const CLINE_PASS_DEFAULT_MODEL = "cline-pass/qwen-3.7-plus";

/** Cline Pass 모델 컨텍스트 윈도우 (Qwen3.7 Plus 기준 131,072 tokens) */
export const CLINE_PASS_CONTEXT_LIMIT = 131_072;

/** Cline Pass 기본 추론 강도 (xhigh = 최고 수준 추론) */
export const CLINE_PASS_DEFAULT_REASONING_EFFORT = "xhigh" as const;

/** Cline Pass 모델 카탈로그 (정적) */
export const CLINE_PASS_MODELS: ClinePassModelInfo[] = [
  {
    id: "cline-pass/qwen-3.7-plus",
    name: "Qwen3.7 Plus (Cline Pass)",
    description:
      "Cline Pass 구독 · Qwen3.7 Plus · 컨텍스트 131K tokens · reasoning xhigh 지원",
    inputTokenLimit: CLINE_PASS_CONTEXT_LIMIT,
    outputTokenLimit: 65_536,
  },
  {
    id: "cline-pass/glm-5.2",
    name: "GLM-5.2 (Cline Pass)",
    description:
      "Cline Pass 구독 · GLM-5.2 · 컨텍스트 202K tokens · reasoning 지원",
    inputTokenLimit: 202_752,
    outputTokenLimit: 131_072,
  },
  {
    id: "cline-pass/glm-5.1",
    name: "GLM-5.1 (Cline Pass)",
    description:
      "Cline Pass 구독 · GLM-5.1 · 컨텍스트 202K tokens · reasoning 지원",
    inputTokenLimit: 202_752,
    outputTokenLimit: 131_072,
  },
];

export interface ClinePassModelInfo {
  id: string;
  name: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit?: number;
}

/** 영구 저장해야 할 토큰 셋 */
export interface ClinePassTokenSet {
  idToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

/**
 * Cline OAuth 인증 시작 URL 생성.
 * Cline API 의 /api/v1/auth/authorize 엔드포인트를 사용하며
 * client_type=extension, callback_url/redirect_uri 를 쿼리로 전달한다.
 *
 * 반환된 URL 을 사용자가 열면 Google 로그인 → 콜백 URL 로 리다이렉트 된다.
 */
export function buildAuthUrl(baseUrl: string, callbackUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(`${base}/api/v1/auth/authorize`);
  url.searchParams.set("client_type", "extension");
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("redirect_uri", callbackUrl);
  return url.toString();
}

/**
 * OAuth 콜백에서 받은 토큰(refreshToken 또는 idToken)을
 * 저장 가능한 ClinePassTokenSet 으로 정규화.
 *
 * Cline 확장은 콜백 파라미터 이름으로 refreshToken | idToken | code 를 사용한다.
 * 여기서는 refreshToken 우선, 없으면 idToken 을 idToken 으로 사용하고
 * refreshToken 이 없으면 빈 문자열로 둔다(갱신 불가 → 재인증 필요).
 */
export function parseCallbackToken(params: URLSearchParams): ClinePassTokenSet | null {
  const refreshToken = params.get("refreshToken") || "";
  const idToken = params.get("idToken") || "";
  const code = params.get("code") || "";

  const token = refreshToken || idToken || code;
  if (!token) return null;

  // idToken 이 별도로 오지 않은 경우, 콜백 토큰 자체를 idToken 으로 간주
  // (Cline 확장도 동일하게 처리: refreshToken || idToken || code)
  return {
    idToken: idToken || token,
    refreshToken: refreshToken || "",
    expiresAt: Date.now() + 60 * 60 * 1000, // 1시간 후 만료 가정 (갱신 시 보정)
  };
}

/**
 * refreshToken 으로 새 idToken 발급.
 * POST /api/v1/auth/refresh
 */
export async function refreshClinePassToken(
  baseUrl: string,
  refreshToken: string
): Promise<ClinePassTokenSet> {
  const base = normalizeBaseUrl(baseUrl);
  const res = await fetch(`${base}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cline token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    idToken?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };

  const idToken = data.idToken || data.accessToken || "";
  if (!idToken) {
    throw new Error("Cline token refresh: 응답에 idToken/accessToken 이 없습니다.");
  }

  return {
    idToken,
    refreshToken: data.refreshToken || refreshToken,
    expiresAt: data.expiresAt || Date.now() + 60 * 60 * 1000,
  };
}

/**
 * 토큰이 만료 임박(5분 이내)이면 자동 갱신.
 * 만료된 경우에도 갱신을 시도하고, 실패하면 원본을 그대로 반환(호출 시 401).
 */
export async function ensureFreshToken(
  baseUrl: string,
  tokenSet: ClinePassTokenSet
): Promise<ClinePassTokenSet> {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  if (tokenSet.expiresAt - now > fiveMin) {
    return tokenSet; // 아직 유효
  }
  if (!tokenSet.refreshToken) {
    return tokenSet; // 갱신 불가 → 재인증 필요
  }
  try {
    return await refreshClinePassToken(baseUrl, tokenSet.refreshToken);
  } catch (err) {
    console.warn("Cline token refresh failed, using existing token:", err);
    return tokenSet;
  }
}

/**
 * Cline Pass 모델 목록 반환.
 * Cline API 에 /api/v1/ai/cline/models 엔드포인트가 있으나 인증이 필요하므로
 * 여기서는 정적 카탈로그를 반환한다. (필요시 API 호출로 대체 가능)
 */
export function getClinePassModels(): ClinePassModelInfo[] {
  return CLINE_PASS_MODELS;
}

export function sanitizeClinePassModelId(modelId: string | undefined): string {
  const id = (modelId || CLINE_PASS_DEFAULT_MODEL).trim();
  // cline-pass/ 접두사가 없으면 붙여준다
  if (!id.startsWith("cline-pass/")) {
    return `cline-pass/${id}`;
  }
  return id;
}

/** BuildMe JSON 요구사항 — Cursor Proxy 와 동일 */
export const BUILDME_JSON_REQUIREMENT_CLINE = `
[IMPORTANT RESPONSE REQUIREMENT]
You MUST reply with a single, valid JSON object. No markdown code fences. Return ONLY raw JSON.

Field rules:
- "updatedContent": PURE section body markdown ONLY.
- "reply": ALL conversational text in natural Korean. Markdown **bold** OK.
- "critique": Usually "" — no formatted critique templates or 【】sections.

JSON Schema:
{
  "reasoning": "Internal thinking in Korean",
  "reply": "Natural Korean chat message",
  "suggestedToc": [{ "id": "string", "title": "string", "status": "pending|writing|reviewing|completed", "content": "", "feedback": "" }],
  "updatedContent": "PURE markdown body for current section only",
  "critique": "",
  "sessionStatus": "interviewing|writing|reviewing|completed",
  "currentSectionId": "string"
}`;

export function buildOpenAIMessagesForClinePass(
  systemInstruction: string,
  geminiContents: Array<{ role: string; parts: Array<{ text: string }> }>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `${systemInstruction}\n${BUILDME_JSON_REQUIREMENT_CLINE}`,
    },
  ];

  for (const item of geminiContents) {
    const text = item.parts?.[0]?.text;
    if (!text?.trim()) continue;
    messages.push({
      role: item.role === "model" ? "assistant" : "user",
      content: text,
    });
  }

  return messages;
}

/**
 * Cline Pass 채팅 스트리밍 (OpenAI 호환 /chat/completions).
 *
 * baseUrl: https://api.cline.bot
 * 실제 엔드포인트: {baseUrl}/api/v1/chat/completions
 * reasoning_effort: xhigh (최고 수준 추론)
 */
export async function streamClinePassChat(
  options: {
    baseUrl: string;
    idToken: string;
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    onChunk: (text: string) => void;
    timeoutMs?: number;
    reasoningEffort?: string;
  }
): Promise<{
  fullText: string;
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const base = normalizeBaseUrl(options.baseUrl);
  const model = sanitizeClinePassModelId(options.model);
  const timeoutMs = options.timeoutMs ?? 300_000;
  const reasoningEffort = options.reasoningEffort || CLINE_PASS_DEFAULT_REASONING_EFFORT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.idToken}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cline.bot",
        "X-Title": "BuildMe",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        stream: true,
        temperature: 0.1,
        reasoning_effort: reasoningEffort,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Cline Pass chat (${res.status}): ${errBody.slice(0, 300)}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Cline Pass: no response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = parsed.choices?.[0]?.delta?.content || "";
          if (delta) {
            fullText += delta;
            options.onChunk(delta);
          }
          if (parsed.usage?.prompt_tokens) promptTokens = parsed.usage.prompt_tokens;
          if (parsed.usage?.completion_tokens)
            completionTokens = parsed.usage.completion_tokens;
        } catch {
          // ignore malformed SSE line
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error("Cline Pass: empty response");
    }

    if (!promptTokens) promptTokens = Math.ceil(JSON.stringify(options.messages).length / 4);
    if (!completionTokens) completionTokens = Math.ceil(fullText.length / 4);

    return { fullText, modelUsed: model, promptTokens, completionTokens };
  } finally {
    clearTimeout(timer);
  }
}