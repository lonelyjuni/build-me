import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

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
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다. 관리자 설정 화면에서 등록해 주세요.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

// Health check and models discovery
app.get("/api/health", async (req, res) => {
  try {
    const ai = getAiClient();
    const modelsResponse: any = await ai.models.list();
    const modelsList = modelsResponse.models || [];
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      availableModels: modelsList.map((m: any) => ({
        name: m.name,
        displayName: m.displayName,
        supportedGenerationMethods: m.supportedGenerationMethods
      }))
    });
  } catch (err: any) {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      errorDiscovery: err.message || err.toString()
    });
  }
});

// Admin settings APIs
app.get("/api/admin/settings", (req, res) => {
  const key = globalSettings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  const maskedKey = key 
    ? (key.length > 10 ? (key.substring(0, 6) + "..." + key.substring(key.length - 4)) : "••••••••")
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
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
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
  
  res.json({ success: true, message: "설정이 성공적으로 저장되었으며, 모든 접속자에게 적용되었습니다." });
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
당신은 거친 생각과 아이디어를 대화형으로 인터뷰하고 구체화하여 한 편의 구조화된 위키/기획서로 빌드업하는 전용 AI 에이전트, 'BuildMe(빌드미)'입니다.
사용자는 완벽한 기획안이 아니라 "거친 생각 조각"을 들고 왔습니다. 당신의 목표는 사용자와 적극적으로 대화하며 생각을 키우고, "살아있는 목차"를 도출한 뒤, 한 섹션씩 공동으로 집필해나가는 것입니다.

[반드시 준수해야 하는 3단계(Phase) 프로세스 워크플로우]
당신은 사용자의 현재 상태에 맞춰 아래 3단계를 순차적으로, 완벽하게 이행해야 합니다:

1단계: 깊은 브레인스토밍 및 인터뷰 (Deep Brainstorming & Interviewing) - 'interviewing' 단계
- 목적: 사용자의 아이디어가 구체화될 때까지 끊임없이 질문하고 탐색하여 깊이 있는 아이디어를 빌드업하는 단계입니다.
- 행동 지침:
  * 사용자가 입력한 거친 아이디어를 바탕으로, 질문 마스터처럼 핵심 질문을 하나씩 던지며 끈질기게 캐물어 구체적인 비즈니스 모델, 가치 제안, 대상 고객, 동작 흐름 등을 끌어냅니다.
  * 질문은 한 번에 여러 개가 아닌, '딱 한 개의 날카로운 질문'만 핵심적으로 던집니다.
  * 이 단계에서는 목차(TOC)를 마음대로 먼저 제공해서는 안 됩니다. (suggestedToc를 응답에 포함하지 마세요)
  * 사용자가 충분히 대답을 마쳤거나(최소 4~5회 이상의 유의미한 대화 흐름이 진행된 경우), 사용자가 "목차를 도출해줘", "목차 추천해줘" 혹은 목차 수정을 요구할 때 비로소 다음 2단계로 넘어갑니다.

2단계: 살아있는 목차(TOC) 제안 및 다듬기 (TOC Proposal & Refinement)
- 목적: 깊은 인터뷰를 통해 빌드업된 아이디어를 토대로, 한 편의 완성도 높은 기획서 구조(TOC)를 최초로 제안하고 사용자와 조율하는 단계입니다.
- 행동 지침:
  * 1단계 대화가 무르익었거나 사용자가 요청했을 때, 체계적이고 구체적인 목차 목록('suggestedToc')을 제안합니다.
  * 목차 구성은 단순히 1, 2, 3, 4, 5뿐만 아니라 필요나 맥락에 따라 '1.1', '1.2', '1.3', '2.1', '2.2'처럼 소항목(상세 하위 목차)까지 적극적으로 구성해 주십시오. (단, '1.1.1'과 같이 3단계 이상으로 깊어지는 것은 불필요하며 복잡성을 가중시키므로 금지합니다. 최대 2단계 하위 목차까지만 구성하세요.)
  * 사용자가 목차 내용의 보완이나 수정을 요구하면, 'suggestedToc'를 업데이트하여 제공하며 글의 전체적인 뼈대와 방향성을 함께 다듬습니다.

3단계: 단계별 순차적 인터랙티브 집필 루프 (Sequential Writing & Critique Loop) - 'writing' 및 'reviewing' 단계
- 목적: 목차가 정해지면, 각 섹션(1.1, 1.2, 1.3 등)을 순차적이고 체계적으로 하나씩 깊게 채우는 단계입니다.
- 행동 지침:
  * [필수 규칙] 집필 및 인터뷰를 진행할 때, 목차는 반드시 1번(예: 1.1)부터 순서대로 순차적으로만 활성화되어 집필이 진행되어야 합니다. 이전 단계의 모든 하위 섹션들이 완료(completed)되기 전에는 다음 메인 번호(예: 2번 대화형 인터뷰)의 하위 섹션을 집필하거나 활성화할 수 없습니다.
  * [필수 규칙] 절대로 사용자가 대화에서 '2번을 선택하자', '2번으로 하자' 등의 '면접 질문의 답안 선택지 번호'를 언급했다고 해서, 그것을 목차의 '2. 대화형 인터뷰' 섹션으로 잘못 오해해 해당 목차를 활성화하거나 currentSectionId를 sec_2로 점프해서는 안 됩니다. 면접 질문에 대한 선택과 목차 집필 대상 섹션은 완전히 별개입니다. 집필은 오직 1.1부터 순서대로만 진행됩니다.
  * 사용자가 특정 목차를 선택하거나 집필이 활성화되면, 해당 섹션의 'updatedContent'에 완성도 높은 마크다운 형식의 본문 산문을 정밀 작성하여 제시합니다. (요약본이나 개조식이 아니라 실제 서비스 기획서에 들어갈 전문적인 산문 글이어야 합니다.)
  * 이와 동시에, 맥킨지 스타일의 냉철하고 날카로운 'critique' 피드백을 함께 제시하여 보완 방향을 제시합니다.
  * 사용자가 이 초안에 대해 피드백을 주면, 피드백을 전적으로 수렴하여 'updatedContent'를 지속적으로 수정본으로 갱신하여 제시합니다.
  * 사용자가 "확정", "저장"이라고 말하거나, 해당 변경사항이 마음에 들어 확정 버튼을 누르면 해당 섹션의 상태는 'completed'가 되고, 당신은 자동으로 다음 섹션(예: 1.2)을 'currentSectionId'로 지정하고 즉시 그 섹션에 대한 최초 본문 초안('updatedContent')과 비평('critique')을 생성하여 루프를 반복해야 합니다.

[금지 사항: 무한 텍스트 반복 및 중복 생성 절대 금지]
- 동일한 문장 구조나 단어 조합(예: "구조화한다스스로", "구조화하게 됩니다스스로", "~다스스로" 등)을 문맥 내에서 비정상적으로 무한 반복 타이핑하는 루프 버그가 절대 발생하지 않도록 하십시오.
- 문장은 자연스럽고 완전한 한국어 종결 어미('~합니다.', '~다.')로 끝나야 하며, 종결어미 뒤에 바로 다른 조사나 명사가 비정상적으로 연이어 달라붙어 끊임없이 생성되는 일이 없어야 합니다.
- 만약 문장을 서술하다가 할 말이 끝났다면 즉시 문장을 종료하고 다음 필드로 넘어가며, 절대 의미 없는 단어 나열로 길이를 늘리지 마십시오.

[자동 중복·흐름 실시간 자가 검토 지침 (TOC Continuous Anti-Overlap Review)]
- 당신은 매 대화(Chat)를 나눌 때마다, 사용자가 별도로 요청하지 않더라도 스스로 현재까지 빌드업된 목차(TOC)와 본문 내용들을 실시간으로 냉철하게 자동 분석해야 합니다.
- 각 섹션 사이에 중복된 서술이나 비즈니스 계획상의 겹침, 흐름의 모순, 혹은 기획의 핵심 본질이 흐려지거나 분산(scattered)되었는지 "스스로 판단"하십시오.
- 중복이나 겹침이 발견되거나 흐름상 합치는 것이 낫다고 판단될 경우, 언제든지 스스로 'suggestedToc'를 보다 짜임새 있고 정교하게 통합/수정하여 반환하고, 'reply' 메세지를 통해 "중복된 흐름을 파악하여 이렇게 정교하게 목차를 최적화했습니다"라고 설명하며 대화를 주도해 나가십시오.

[맥킨지 스타일 비평(Critique) 원칙]
- 결론부터 단도직입적으로 말합니다. (요점 먼저, 근거는 그 뒤)
- 중복과 군더더기, 추상적인 용어를 극도로 배제하고 알맹이(정의, 배경, 핵심)는 살리되 정교하게 개선할 점을 명확히 합니다.
- 무조건적인 칭찬보다는 보완이 시급한 약점과 그 이유를 구체적으로 짚고, 즉각적인 대안을 제시하세요.

[에이전트의 추론 과정(Reasoning) 기록 원칙]
- 당신은 응답 시 'reasoning' 필드에 현재 사용자의 입력을 어떻게 분석했는지, 현재 어떤 단계(Phase)에 위치해 있는지, 사용자의 의도를 파악한 결과와 다음 행동 방향을 정하기 위한 깊은 고민의 과정을 날것 그대로 한국어로 자세히 적어야 합니다. 이 추론 과정은 사용자가 볼 수 있습니다.

[현재 세션 정보]
- 원초적 아이디어 (Raw Idea): "${sessionState.rawIdea}"
- 현재 전체 세션 상태: "${sessionState.status}"
- 현재 포커스 중인 섹션: ${sessionState.currentSectionId ? `"${sessionState.toc.find((t: any) => t.id === sessionState.currentSectionId)?.title}"` : '없음'}
- 현재까지 구성된 목차 (TOC): ${JSON.stringify(sessionState.toc.map((t: any) => ({ id: t.id, title: t.title, status: t.status })))}

[대화의 흐름 맥락]
지금까지 나눈 대화 기록과 목차 상태를 바탕으로, 사용자의 최신 입력 "${userMessage}"에 대해 가장 적절한 'reply'를 생성하고 필요시 'suggestedToc', 'updatedContent', 'critique', 'reasoning', 'sessionStatus'를 실시간 갱신해 반환하세요.
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

    // Model selection and dynamic routing fallback chain (Preferred: Gemma 4 31B -> Gemma 4 26B)
    let primaryModel = selectedModelId || globalSettings.selectedModelId;
    let fallbackChain: string[] = [];
    const isRouting = routingEnabled !== undefined ? routingEnabled : globalSettings.routingEnabled;

    if (isRouting) {
      if (primaryModel === 'gemma-4-31b') {
        fallbackChain = ['gemma-4-31b', 'gemma-4-26b'];
      } else {
        fallbackChain = ['gemma-4-26b', 'gemma-4-31b'];
      }
    } else {
      fallbackChain = [primaryModel];
    }

    let responseStream: any = null;
    let actualModelUsed = '';
    let actualApiModelUsed = 'gemini-2.5-flash';
    let contextTokens = 0;
    let lastError: any = null;

    for (const model of fallbackChain) {
      try {
        actualModelUsed = model;
        let actualApiModel = model;
        
        // Map mock/simulated models to a real supported Gemini API model
        if (model === 'gemma-4-31b' || model === 'gemma-4-26b') {
          actualApiModel = 'gemini-2.5-flash';
        }
        
        actualApiModelUsed = actualApiModel;

        const isGemma = model.toLowerCase().includes('gemma');

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
                description: "에이전트가 이 판단을 내리고 답변을 준비하기 위해 수행한 내부적인 단계별 고민 및 생각 과정 (현재 단계, 사용자 의도 분석, 질문 설계 등). 반드시 첫 번째로 생성하세요."
              },
              reply: { 
                type: Type.STRING, 
                description: "사용자에게 보낼 채팅 응답 메시지. 인터뷰 질문이나 설명, 제안 등이 담깁니다." 
              },
              suggestedToc: {
                type: Type.ARRAY,
                description: "새롭게 제안되거나 정교화된 목차 목록 (목차 도출 시점이나 사용자가 목차 수정을 원할 때 포함). 기존 목차가 있는 경우, 형식을 유지하며 변경 혹은 신규 목차를 제안합니다.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "고유 아이디 (예: sec_1, sec_2 등)" },
                    title: { type: Type.STRING, description: "섹션 제목" },
                    status: { 
                      type: Type.STRING, 
                      enum: ["pending", "writing", "reviewing", "completed"],
                      description: "섹션의 진행 상태" 
                    },
                    content: { type: Type.STRING, description: "작성된 본문 (마크다운 포맷)" },
                    feedback: { type: Type.STRING, description: "해당 본문에 대한 비평 내용" }
                  },
                  required: ["id", "title", "status"]
                }
              },
              updatedContent: { 
                type: Type.STRING, 
                description: "현재 집필/수정 중인 섹션의 완성된 마크다운 본문 (집필 중일 때 필수)" 
              },
              critique: { 
                type: Type.STRING, 
                description: "작성된 본문에 대한 맥킨지 스타일의 아주 구체적이고 날카로운 비평 내용 (집필 중일 때 필수)" 
              },
              sessionStatus: { 
                type: Type.STRING, 
                enum: ["interviewing", "writing", "reviewing", "completed"],
                description: "세션의 전체 진행 단계 판단" 
              },
              currentSectionId: {
                type: Type.STRING,
                description: "현재 초점을 맞추어 집필해야 하는 섹션 ID"
              }
            },
            required: ["reasoning", "reply", "sessionStatus"]
          };
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
    const actualModelLimit = actualApiModelUsed.includes('pro') ? 2000000 : 1000000;
    const estimatedResponseTokens = Math.ceil(generatedText.length / 2.5);
    const finalContextTokens = Math.min(actualModelLimit, contextTokens + estimatedResponseTokens);

    // Send final metadata
    res.write(JSON.stringify({
      type: "metadata",
      modelUsed: actualModelUsed,
      fallbackOccurred: actualModelUsed !== primaryModel,
      contextTokens: finalContextTokens,
      contextLimit: actualModelLimit
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

// Configure Vite or Serve static assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BuildMe server running on http://localhost:${PORT}`);
  });
}

// Local dev only — Vercel serves static files + api/ serverless handler
if (!process.env.VERCEL) {
  startServer();
}

export default app;
