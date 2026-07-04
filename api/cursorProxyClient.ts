/** Cursor API Proxy (OpenAI-compatible) — manual.md 기준 */

export const CURSOR_PROXY_DEFAULT_BASE_URL =
  process.env.CURSOR_PROXY_BASE_URL?.trim() || "http://168.107.36.218:8765/v1";

export const CURSOR_PROXY_DEFAULT_MODEL = "composer-2.5";

/** Composer 2.5 공식 컨텍스트 윈도우 (Kimi K2.5 기반, Cursor 문서 기준 200K) */
export const CURSOR_COMPOSER_25_CONTEXT_LIMIT = 200_000;

/** composer-2.5-fast 등 Fast 변형은 사용 금지 */
const BLOCKED_MODEL_PATTERNS = [/composer-2\.5-fast/i, /-fast$/i];

export function isBlockedCursorModel(modelId: string): boolean {
  const id = modelId.trim();
  return BLOCKED_MODEL_PATTERNS.some((re) => re.test(id));
}

export function sanitizeCursorModelId(modelId: string | undefined): string {
  const id = (modelId || CURSOR_PROXY_DEFAULT_MODEL).trim();
  if (id !== CURSOR_PROXY_DEFAULT_MODEL || isBlockedCursorModel(id)) {
    return CURSOR_PROXY_DEFAULT_MODEL;
  }
  return id;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export interface CursorProxyModelInfo {
  id: string;
  name: string;
  description: string;
  ownedBy?: string;
  inputTokenLimit: number;
  outputTokenLimit?: number;
}

export async function fetchCursorProxyHealth(baseUrl: string, apiKey: string) {
  const root = normalizeBaseUrl(baseUrl).replace(/\/v1$/, "");
  const res = await fetch(`${root}/health`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json();
}

export async function fetchCursorProxyModels(
  baseUrl: string,
  apiKey: string
): Promise<CursorProxyModelInfo[]> {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cursor Proxy models (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: Array<{ id: string; owned_by?: string }> };
  const raw = data.data || [];

  const composer = raw.find((m) => m.id === CURSOR_PROXY_DEFAULT_MODEL);
  if (!composer) {
    throw new Error(`Cursor Proxy에 ${CURSOR_PROXY_DEFAULT_MODEL} 모델이 없습니다.`);
  }

  return [
    {
      id: CURSOR_PROXY_DEFAULT_MODEL,
      name: "Composer 2.5",
      description: `Cursor Proxy · ${composer.owned_by || "cursor"} · 컨텍스트 ${CURSOR_COMPOSER_25_CONTEXT_LIMIT.toLocaleString()} tokens`,
      ownedBy: composer.owned_by,
      inputTokenLimit: CURSOR_COMPOSER_25_CONTEXT_LIMIT,
    },
  ];
}

export const BUILDME_JSON_REQUIREMENT = `
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

export function buildOpenAIMessages(
  systemInstruction: string,
  geminiContents: Array<{ role: string; parts: Array<{ text: string }> }>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `${systemInstruction}\n${BUILDME_JSON_REQUIREMENT}`,
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

export async function streamCursorProxyChat(
  options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    onChunk: (text: string) => void;
    timeoutMs?: number;
  }
): Promise<{
  fullText: string;
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const model = sanitizeCursorModelId(options.model);
  const timeoutMs = options.timeoutMs ?? 300_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        stream: true,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Cursor Proxy chat (${res.status}): ${errBody.slice(0, 300)}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Cursor Proxy: no response body");
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
          if (parsed.usage?.completion_tokens) completionTokens = parsed.usage.completion_tokens;
        } catch {
          // ignore malformed SSE line
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error("Cursor Proxy: empty response");
    }

    if (!promptTokens) promptTokens = Math.ceil(JSON.stringify(options.messages).length / 4);
    if (!completionTokens) completionTokens = Math.ceil(fullText.length / 4);

    return { fullText, modelUsed: model, promptTokens, completionTokens };
  } finally {
    clearTimeout(timer);
  }
}
