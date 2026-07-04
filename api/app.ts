import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables (.env.local first, then .env)
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

// Increase JSON and URL-encoded payload limits to prevent PayloadTooLargeError
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Global dynamic settings stored in-memory
let globalSettings = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  routingEnabled: true,
  selectedModelId: "gemma-4-31b",
  adminPassword: "admin", // Default password to access config
};

// Lazy-initialized Gemini Client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const key = globalSettings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY? ??????? ???????? ??? ??? ?????? ?????????");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

async function fetchAvailableModels() {
  const ai = getAiClient();
  const pager = await ai.models.list();
  const models: Array<{
    id: string;
    name: string;
    description: string;
    inputTokenLimit: number;
    outputTokenLimit: number;
    version?: string;
  }> = [];

  for await (const model of pager) {
    const actions = (model as any).supportedGenerationMethods || model.supportedActions || [];
    if (!actions.includes("generateContent")) continue;
    const id = (model.name || "").replace(/^models\//, "");
    models.push({
      id,
      name: model.displayName || id,
      description: model.description || "",
      inputTokenLimit: model.inputTokenLimit || 0,
      outputTokenLimit: model.outputTokenLimit || 0,
      version: model.version,
    });
  }

  return models;
}

const MODEL_API_MAP: Record<string, string> = {
  "gemma-4-31b": "gemma-4-31b-it",
  "gemma-4-26b": "gemma-4-26b-a4b-it",
};

function resolveApiModelId(uiModelId: string): string {
  return MODEL_API_MAP[uiModelId] || uiModelId;
}

function buildFallbackChain(primary: string, isRouting: boolean): string[] {
  if (!isRouting) return [primary];
  if (primary === "gemma-4-31b") return ["gemma-4-31b", "gemma-4-26b"];
  if (primary === "gemma-4-26b") return ["gemma-4-26b", "gemma-4-31b"];
  return [primary];
}

/** 세션에 쌓인 대화만 추출 (시스템 알림 제외) */
function buildChatContentsForContextCount(
  sessionState: any,
  userMessage: string,
  latestModelText?: string
) {
  const chatMessages = (sessionState.history || []).filter(
    (msg: any) =>
      (msg.role === "user" || msg.role === "model") &&
      msg.type !== "system_alert" &&
      typeof msg.text === "string" &&
      msg.text.trim()
  );

  const contents = chatMessages.map((msg: any) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.text }],
  }));

  const last = chatMessages[chatMessages.length - 1];
  const userAlreadyInHistory = last?.role === "user" && last?.text === userMessage;

  if (!userAlreadyInHistory && userMessage?.trim()) {
    contents.push({ role: "user", parts: [{ text: userMessage }] });
  }

  if (latestModelText?.trim()) {
    contents.push({ role: "model", parts: [{ text: latestModelText }] });
  }

  return contents;
}

function extractModelChatTextFromResponse(generatedText: string): string {
  try {
    let cleaned = generatedText.trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(cleaned);
    const parts: string[] = [];
    if (parsed.reply?.trim()) parts.push(parsed.reply.trim());
    if (parsed.critique?.trim()) {
      const critique = parsed.critique.trim();
      if (!parts[0]?.includes(critique.slice(0, Math.min(40, critique.length)))) {
        parts.push(`\n\n**[비평 및 코멘트]**\n${critique}`);
      }
    }
    return parts.join("") || generatedText;
  } catch {
    return generatedText;
  }
}

/** LLM이 점유하는 누적 컨텍스트 = 시스템 지시 + 전체 대화 + 이번 응답 */
async function countSessionContextTokens(
  ai: GoogleGenAI,
  model: string,
  systemInstruction: string,
  sessionState: any,
  userMessage: string,
  generatedText: string
): Promise<{ contextTokens: number; outputTokens: number }> {
  const modelChatText = extractModelChatTextFromResponse(generatedText);
  const contents = buildChatContentsForContextCount(
    sessionState,
    userMessage,
    modelChatText
  );

  let contextTokens = 0;
  let outputTokens = 0;

  try {
    const contextResult = await ai.models.countTokens({
      model,
      contents,
      config: { systemInstruction },
    });
    contextTokens = contextResult.totalTokens || 0;
  } catch {
    try {
      const fallbackResult = await ai.models.countTokens({
        model,
        contents: [
          { role: "user", parts: [{ text: systemInstruction }] },
          ...contents,
        ],
      });
      contextTokens = fallbackResult.totalTokens || 0;
    } catch {
      const charCount =
        systemInstruction.length +
        contents.reduce((sum, item) => sum + (item.parts[0]?.text?.length || 0), 0);
      contextTokens = Math.ceil(charCount / 4);
    }
  }

  const outputText = modelChatText || generatedText;
  try {
    const outputResult = await ai.models.countTokens({
      model,
      contents: [{ role: "model", parts: [{ text: outputText }] }],
    });
    outputTokens = outputResult.totalTokens || 0;
  } catch {
    outputTokens = Math.ceil(outputText.length / 2.5);
  }

  return { contextTokens, outputTokens };
}

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const models = await fetchAvailableModels();
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      modelCount: models.length,
      availableModels: models,
    });
  } catch (err: any) {
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      errorDiscovery: err.message || err.toString(),
      availableModels: [],
    });
  }
});

// List models available for text generation (from Gemini API)
app.get("/api/models", async (req, res) => {
  try {
    const models = await fetchAvailableModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch models from Gemini API" });
  }
});

// Admin settings APIs
app.get("/api/admin/settings", (req, res) => {
  const key = globalSettings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  const maskedKey = key 
    ? (key.length > 10 ? (key.substring(0, 6) + "..." + key.substring(key.length - 4)) : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")
    : "";
  res.json({
    routingEnabled: globalSettings.routingEnabled,
    selectedModelId: globalSettings.selectedModelId,
    hasApiKey: !!key,
    maskedApiKey: maskedKey,
  });
});

app.post("/api/admin/settings", (req, res) => {
  const { password, geminiApiKey, routingEnabled, selectedModelId } = req.body;
  
  if (password !== globalSettings.adminPassword) {
    return res.status(401).json({ error: "?????? ?????? ??????." });
  }
  
  if (geminiApiKey !== undefined && geminiApiKey !== "") {
    // Check if it's actually updated (not our masked key placeholder)
    if (!geminiApiKey.includes("...")) {
      globalSettings.geminiApiKey = geminiApiKey;
      aiClient = null; // force re-initialization with new key
    }
  }
  
  if (routingEnabled !== undefined) {
    globalSettings.routingEnabled = routingEnabled;
  }
  
  if (selectedModelId !== undefined) {
    globalSettings.selectedModelId = selectedModelId;
  }
  
  res.json({ success: true, message: "??????????????????????? ?? ???????????????????" });
});

// Chat brainstorming endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionState, userMessage, selectedModelId, routingEnabled } = req.body;
    
    if (!sessionState) {
      return res.status(400).json({ error: "sessionState is required" });
    }

    const ai = getAiClient();

    // Prepare system instructions for BuildMe agent
    const systemInstruction = `
당신은 아이디어를 구조화된 기획 위키/PRD로 발전시키는 AI 에이전트 'BuildMe'입니다.
사용자의 거친 아이디어를 "기획서"로 다듬는 것이 목표입니다.

[3단계(Phase) 워크플로우]

1단계: 심층 브레인스토밍 & 인터뷰 - sessionStatus: 'interviewing'
- 사용자에게 날카로운 질문을 던져 요구사항·타깃·차별점을 파악합니다.
- 충분한 정보가 모이면 목차(TOC) 초안을 suggestedToc로 제안합니다.

2단계: 목차(TOC) 제안 & 확정 - sessionStatus: 'writing'으로 전환
- suggestedToc 형식 규칙 (반드시 준수):
  * 상위 섹션: "1. 프로젝트 개요", "2. 사용자 분석", "3. 핵심 기능" 형식 (번호. 제목)
  * 하위 섹션: "1.1 기획 배경", "1.2 MVP 범위", "3.1 기능A", "3.2 기능B" 형식 — 반드시 별도 항목으로 id를 부여
  * 영문 카테고리명·부가 설명은 별도 항목으로 만들지 말고 제목 뒤 괄호로 표기
    예: "3. 핵심 기능 상세 요구사항 (Functional Requirements)" / "3.1 능동적 지식 추출 (Proactive Probing)"
  * "Functional Requirements", "User Flow" 같은 영문만 있는 항목을 목차에 단독으로 넣지 마세요.
  * 하위 목차를 괄호 안에만 쓰지 말고, 1.1·1.2처럼 각각 독립 항목으로 나열하세요.

3단계: 순차 집필 & 피드백 루프 - sessionStatus: 'writing' 또는 'reviewing'
- 집필 단위는 하위 섹션(1.1, 1.2, 3.1...)입니다. 상위 섹션(1., 2., 3.)은 그룹 헤더이며 직접 집필하지 않습니다.

[집필 초안 vs 대화창 — 반드시 분리]
- updatedContent: 오직 해당 목차 섹션의 '기획서 본문'만 마크다운으로 작성. 메타 설명·작성 사유·인사·질문·비평·피드백 반영 설명·반박 의견을 절대 넣지 마세요. 제목(##)도 섹션 본문에 중복 넣지 마세요.
- reply: 대화창용. 초안 작성 이유·구성 의도·핵심 포인트 설명, 사용자 피드백 수용/반박, 수정 사항 요약, 추가 질문을 여기에 작성합니다.
- critique: 맥킨지 스타일 비평. reply에 요약을 넣고, critique에 상세 비평을 작성합니다. 둘 다 대화창에만 표시됩니다.
- 집필 중 suggestedToc는 보내지 마세요.

- [초안 작성] updatedContent에 본문만, reply/critique에 설명·비평
- [피드백 반영] updatedContent 본문 수정, reply에 무엇을 바꿨는지·왜 그렇게 했는지·동의하지 않는 부분 반박
- [확정] 사용자가 "확정"/"저장"하면 해당 섹션 completed, 다음 하위 섹션으로 이동

[TOC 지속 검토]
- 대화마다 목차 중복·누락을 점검하고, 수정 시에만 suggestedToc를 전체 목록으로 보냅니다.

[비평(Critique) 원칙]
- 날카롭고 구체적이며 실행 가능한 개선점을 제시합니다.

[추론(Reasoning)]
- reasoning 필드에 단계별 사고 과정을 한국어로 기록합니다.

[현재 세션 상태]
- 원본 아이디어: "${sessionState.rawIdea}"
- 세션 상태: "${sessionState.status}"
- 현재 집필 섹션: ${sessionState.currentSectionId ? `"${sessionState.toc.find((t: any) => t.id === sessionState.currentSectionId)?.title}"` : '없음'}
- 목차(TOC): ${JSON.stringify(sessionState.toc.map((t: any) => ({ id: t.id, title: t.title, status: t.status, parentId: t.parentId })))}

[응답 지침]
위 맥락을 바탕으로 사용자 메시지 "${userMessage}"에 응답하세요.
- reply + critique → 대화창 (설명·비평·피드백 대화 전부)
- updatedContent → 집필 초안 탭 (순수 기획서 본문만)
- suggestedToc / reasoning / sessionStatus / currentSectionId → JSON 필드
`;

    // Map history to Gemini API Content format
    // Keep only last 15 messages to prevent context explosion but keep enough context
    const recentHistory = sessionState.history.slice(-15);
    const contents = recentHistory.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Append the current user message if it's not already in history
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const getFullErrorMessage = (err: any): string => {
      if (!err) return "Unknown error";
      let msg = err.message || err.toString();
      if (err.status) {
        msg += ` (API Status: ${err.status})`;
      }
      if (err.errorDetails) {
        msg += ` (Details: ${JSON.stringify(err.errorDetails)})`;
      }
      return msg;
    };

    // Model selection and dynamic routing fallback chain
    const primaryModel = selectedModelId || globalSettings.selectedModelId;
    const isRouting = routingEnabled !== undefined ? routingEnabled : globalSettings.routingEnabled;

    const fallbackChain = buildFallbackChain(primaryModel, isRouting);

    let responseStream: any = null;
    let actualModelUsed = '';
    let actualApiModelUsed = resolveApiModelId(primaryModel);
    let modelInputTokenLimit = 1048576;
    let modelOutputTokenLimit = 32768;
    let lastError: any = null;

    for (const model of fallbackChain) {
      try {
        actualModelUsed = model;
        const actualApiModel = resolveApiModelId(model);
        actualApiModelUsed = actualApiModel;

        const isGemma = actualApiModel.toLowerCase().includes("gemma");

        // Adjust contents for Gemma models to include system instructions and schema instructions inside user message
        let modelContents = [...contents];
        if (isGemma) {
          // Prepend system instructions to the very first user message since Gemma doesn't support the systemInstruction config field
          if (modelContents.length > 0 && modelContents[0].role === 'user') {
            modelContents[0] = {
              ...modelContents[0],
              parts: [{ text: `[System Instruction]\n${systemInstruction}\n\n[End of System Instruction]\n\n` + modelContents[0].parts[0].text }]
            };
          } else {
            modelContents.unshift({
              role: 'user',
              parts: [{ text: `[System Instruction]\n${systemInstruction}\n\n[End of System Instruction]` }]
            });
          }

          const jsonRequirement = `\n\n[IMPORTANT RESPONSE REQUIREMENT]\nYou MUST reply with a single, valid JSON object. No markdown code fences. Return ONLY raw JSON.\n\nField rules:\n- "updatedContent": PURE section body markdown ONLY. No explanations, greetings, critique, or section title headers.\n- "reply": ALL conversational text — draft rationale, feedback acceptance, counter-arguments, questions.\n- "critique": McKinsey-style critique (shown in chat, NOT in draft).\n\nJSON Schema:\n{\n  "reasoning": "Internal thinking in Korean",\n  "reply": "Chat message in Korean — explanations, feedback dialogue, NOT draft body",\n  "suggestedToc": [{ "id": "string", "title": "string", "status": "pending|writing|reviewing|completed", "content": "", "feedback": "" }],\n  "updatedContent": "PURE markdown body for current section only — no meta text",\n  "critique": "McKinsey critique for chat only",\n  "sessionStatus": "interviewing|writing|reviewing|completed",\n  "currentSectionId": "string"\n}`;
          const lastMsg = modelContents[modelContents.length - 1];
          modelContents[modelContents.length - 1] = {
            ...lastMsg,
            parts: [{ text: lastMsg.parts[0].text + jsonRequirement }]
          };
        }

        const config: any = {
          temperature: 0.1,
        };

        if (!isGemma) {
          config.systemInstruction = systemInstruction;
          config.responseMimeType = "application/json";
          config.responseSchema = {
            type: Type.OBJECT,
            properties: {
              reasoning: {
                type: Type.STRING,
                description: "??????? ?????????????????????????? ???????????? ???????? ????? ?? (??? ???, ???????? ??, ?? ??? ??. ??????????????????"
              },
              reply: { 
                type: Type.STRING, 
                description: "대화창 전용. 초안 작성 사유, 피드백 수용/반박, 설명, 질문. 본문은 넣지 마세요." 
              },
              suggestedToc: {
                type: Type.ARRAY,
                description: "??????????????????? ?? ?? (?? ??? ?????? ??????? ?? ???????? ?????). ?? ??? ??? ??, ???????????? ??????? ??? ????????????",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "?? ?????(?? sec_1, sec_2 ??" },
                    title: { type: Type.STRING, description: "??? ???" },
                    status: { 
                      type: Type.STRING, 
                      enum: ["pending", "writing", "reviewing", "completed"],
                      description: "??????? ???" 
                    },
                    content: { type: Type.STRING, description: "??????? (????? ???)" },
                    feedback: { type: Type.STRING, description: "??? ?????????? ???" }
                  },
                  required: ["id", "title", "status"]
                }
              },
              updatedContent: { 
                type: Type.STRING, 
                description: "집필 초안 탭 전용. 해당 섹션 기획서 본문만. 설명·비평·인사 금지." 
              },
              critique: { 
                type: Type.STRING, 
                description: "대화창 전용 맥킨지 스타일 비평. 집필 초안에 넣지 마세요." 
              },
              sessionStatus: { 
                type: Type.STRING, 
                enum: ["interviewing", "writing", "reviewing", "completed"],
                description: "???????? ?? ??? ???" 
              },
              currentSectionId: {
                type: Type.STRING,
                description: "??? ????????????? ??? ??? ID"
              }
            },
            required: ["reasoning", "reply", "sessionStatus"]
          };
        }

        try {
          const modelInfo = await ai.models.get({ model: actualApiModel });
          if (modelInfo.inputTokenLimit) {
            modelInputTokenLimit = modelInfo.inputTokenLimit;
          }
          if (modelInfo.outputTokenLimit) {
            modelOutputTokenLimit = modelInfo.outputTokenLimit;
          }
        } catch (modelInfoErr) {
          console.warn(`models.get failed for ${actualApiModel}:`, modelInfoErr);
        }

        responseStream = await ai.models.generateContentStream({
          model: actualApiModel,
          contents: modelContents,
          config: config
        });

        // Break if stream acquisition succeeds
        if (responseStream) {
          break;
        }
      } catch (err: any) {
        const detailMsg = getFullErrorMessage(err);
        lastError = new Error(`API Error on model ${model}: ${detailMsg}`);
        console.warn(`Model ${model} failed, attempting fallback if available:`, detailMsg);
      }
    }

    if (!responseStream) {
      throw lastError || new Error("Failed to generate content with any model in the routing chain");
    }

    // Set SSE headers or standard stream headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering for immediate delivery

    let generatedText = "";
    for await (const chunk of responseStream) {
      if (chunk.text) {
        generatedText += chunk.text;
        res.write(JSON.stringify({ type: "chunk", text: chunk.text }) + "\n");
      }
    }

    // LLM 누적 컨텍스트 = 시스템 지시 + 세션 대화 + 이번 응답
    const { contextTokens: measuredContext, outputTokens: measuredOutput } =
      await countSessionContextTokens(
        ai,
        actualApiModelUsed,
        systemInstruction,
        sessionState,
        userMessage,
        generatedText
      );

    const finalContextTokens = Math.min(modelInputTokenLimit, measuredContext);
    const finalOutputTokens = Math.min(modelOutputTokenLimit, measuredOutput);

    // Send final metadata
    res.write(JSON.stringify({
      type: "metadata",
      modelUsed: actualModelUsed,
      apiModelId: actualApiModelUsed,
      fallbackOccurred: actualModelUsed !== primaryModel,
      contextTokens: finalContextTokens,
      contextLimit: modelInputTokenLimit,
      outputTokens: finalOutputTokens,
      outputTokenLimit: modelOutputTokenLimit,
    }) + "\n");

    res.end();

  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    // If headers already sent, write error chunk instead of json
    if (res.headersSent) {
      res.write(JSON.stringify({ type: "error", message: error.message || "Internal server error during streaming" }) + "\n");
      res.end();
    } else {
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
});

export default app;
