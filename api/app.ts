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
- [초안 작성] currentSectionId에 해당하는 섹션의 전문을 updatedContent에 마크다운으로 작성합니다.
- [비평] critique에 맥킨지 스타일 비평을 작성합니다.
- [피드백 반영] 사용자가 수정 요청하면 updatedContent를 수정하고 critique도 갱신합니다. sessionStatus는 'reviewing'.
- [확정] 사용자가 "확정"/"저장"하면 해당 섹션 status를 completed로, 다음 하위 섹션(예: 1.1→1.2)으로 currentSectionId를 이동합니다.
- 집필 중에는 suggestedToc를 보내지 마세요 (목차 구조가 바뀔 필요가 없으면 생략). updatedContent와 critique에 집중하세요.

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
위 맥락을 바탕으로 사용자 메시지 "${userMessage}"에 응답하세요. reply는 대화용, suggestedToc/updatedContent/critique/reasoning/sessionStatus/currentSectionId는 JSON 필드로 채우세요.
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
    let contextTokens = 0;
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

          const jsonRequirement = `\n\n[IMPORTANT RESPONSE REQUIREMENT]\nYou MUST reply with a single, valid JSON object matching the following schema. Do NOT include any markdown code block wrappers (like \`\`\`json) or conversational introduction/conclusion outside the JSON object. Return ONLY the raw JSON string.\n\nJSON Schema:\n{\n  "reasoning": "Internal step-by-step thinking process in Korean. Think deeply and list reasoning steps before responding.",\n  "reply": "Conversational reply or interview question in Korean.",\n  "suggestedToc": [\n    { "id": "string", "title": "string", "status": "pending|writing|reviewing|completed", "content": "string (markdown)", "feedback": "string (critique)" }\n  ],\n  "updatedContent": "string (completed or modified markdown content for current section)",\n  "critique": "string (McKinsey-style critique/feedback)",\n  "sessionStatus": "interviewing|writing|reviewing|completed",\n  "currentSectionId": "string"\n}`;
          const lastMsg = modelContents[modelContents.length - 1];
          modelContents[modelContents.length - 1] = {
            ...lastMsg,
            parts: [{ text: lastMsg.parts[0].text + jsonRequirement }]
          };
        }

        // Calculate cumulative context tokens for the ENTIRE history from the start of the session
        try {
          const allSessionContents = sessionState.history.map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          }));
          
          // Check if userMessage is already in the last history element to avoid duplicate counting
          const isUserMsgAlreadyInHistory = sessionState.history.length > 0 && 
            sessionState.history[sessionState.history.length - 1].role === 'user' &&
            sessionState.history[sessionState.history.length - 1].text === userMessage;
            
          if (!isUserMsgAlreadyInHistory) {
            allSessionContents.push({
              role: 'user',
              parts: [{ text: userMessage }]
            });
          }
          
          const fullTokenCountResult = await ai.models.countTokens({
            model: actualApiModel,
            contents: allSessionContents,
          });
          contextTokens = fullTokenCountResult.totalTokens || 0;
        } catch (tokenErr) {
          console.warn(`cumulative countTokens failed for ${actualApiModel}:`, tokenErr);
          const charCount = JSON.stringify(sessionState.history).length + userMessage.length;
          contextTokens = Math.ceil(charCount / 4);
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
                description: "?????????? ?? ??? ???. ?????????? ???, ??? ??? ??????." 
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
                description: "??? ??/??? ?? ??????????????? ?? (?? ?? ?????)" 
              },
              critique: { 
                type: Type.STRING, 
                description: "???????????????? ??????? ??? ???????????? ?? ??? (?? ?? ?????)" 
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

    // Get context limits based on the actual API model used
    const actualModelLimit = modelInputTokenLimit;
    const estimatedResponseTokens = Math.ceil(generatedText.length / 2.5);
    const finalContextTokens = Math.min(actualModelLimit, contextTokens + estimatedResponseTokens);
    const finalOutputTokens = Math.min(modelOutputTokenLimit, estimatedResponseTokens);

    // Send final metadata
    res.write(JSON.stringify({
      type: "metadata",
      modelUsed: actualModelUsed,
      apiModelId: actualApiModelUsed,
      fallbackOccurred: actualModelUsed !== primaryModel,
      contextTokens: finalContextTokens,
      contextLimit: actualModelLimit,
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
