import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrainstormSession, ChatMessage, TocSection, ModelSettings, ModelConfig } from './types';
import Sidebar from './components/Sidebar';
import TableOfContents from './components/TableOfContents';
import ChatPanel from './components/ChatPanel';
import DocPreview from './components/DocPreview';
import ResizableSplitPane from './components/ResizableSplitPane';
import { buildGemmaModelsFromApi, MODEL_API_MAP, GEMMA_MODEL_DEFINITIONS } from './modelCatalog';
import {
  findNextWritableSection,
  normalizeTocSections,
  getSectionDisplayLabel,
  buildFullWikiMarkdown,
  isChapterJustCompleted,
  getChapterNumberForSection,
  buildChapterReviewMarkdown,
  buildConfirmedContentMarkdown,
  applySuggestedToc,
  parseTocOutlineFromReply,
  filterDocumentTocSections,
  isInterviewQuestionToc,
  repairTocSections,
  userRequestsTocUpdate,
} from './tocUtils';
import { sanitizeDraftContent, buildModelChatText, extractSuggestedTocFromJsonBuffer, shouldRequestTocFromAi, TOC_JSON_FOLLOWUP_PROMPT } from './contentUtils';
import { clientDevLog } from './devLogger';
import { Settings, RefreshCw, Layers, MessageSquare, FileText as FileIcon, ArrowRight, Plug } from 'lucide-react';

export default function App() {
  const [sessions, setSessions] = useState<BrainstormSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [realTimeProgress, setRealTimeProgress] = useState<{
    reasoning: string;
    reply: string;
    updatedContent: string;
    critique: string;
    currentActiveField: 'reasoning' | 'reply' | 'updatedContent' | 'critique' | 'none';
    streamPhase?: 'connecting' | 'reasoning' | 'draft' | 'reply' | 'critique';
    streamLabel?: string;
  }>({
    reasoning: '',
    reply: '',
    updatedContent: '',
    critique: '',
    currentActiveField: 'none'
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'doc'>('chat');
  const [isSidebarOpenOnMobile, setIsSidebarOpenOnMobile] = useState(false);
  const [isDesktopSidebarExpanded, setIsDesktopSidebarExpanded] = useState(false);
  const sidebarHoverRef = useRef(false);
  const chatHoverRef = useRef(false);
  const sidebarCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collapseSidebarUnlessHovered = useCallback(() => {
    if (window.innerWidth < 768) return;
    if (sidebarHoverRef.current) return;
    if (sidebarCollapseTimerRef.current) clearTimeout(sidebarCollapseTimerRef.current);
    setIsDesktopSidebarExpanded(false);
  }, []);

  const chatPanelInteractionProps = {
    onMouseEnter: () => {
      chatHoverRef.current = true;
      collapseSidebarUnlessHovered();
    },
    onMouseLeave: () => {
      chatHoverRef.current = false;
    },
    onFocusCapture: () => {
      chatHoverRef.current = true;
      collapseSidebarUnlessHovered();
    },
  };

  const scheduleSidebarCollapse = useCallback(() => {
    if (sidebarCollapseTimerRef.current) clearTimeout(sidebarCollapseTimerRef.current);
    sidebarCollapseTimerRef.current = setTimeout(() => {
      if (!sidebarHoverRef.current) setIsDesktopSidebarExpanded(false);
    }, 350);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (window.innerWidth < 768) return;
      if (e.clientX <= 14) {
        if (sidebarCollapseTimerRef.current) clearTimeout(sidebarCollapseTimerRef.current);
        setIsDesktopSidebarExpanded(true);
      } else if (chatHoverRef.current && !sidebarHoverRef.current) {
        setIsDesktopSidebarExpanded(false);
      } else if (!sidebarHoverRef.current && !chatHoverRef.current && e.clientX > 340) {
        scheduleSidebarCollapse();
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (sidebarCollapseTimerRef.current) clearTimeout(sidebarCollapseTimerRef.current);
    };
  }, [scheduleSidebarCollapse]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminApiKey, setAdminApiKey] = useState('');
  const [serverMaskedApiKey, setServerMaskedApiKey] = useState('');
  const [serverHasApiKey, setServerHasApiKey] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsLoadError, setModelsLoadError] = useState<string | null>(null);

  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    activeProvider: 'gemini',
    selectedModelId: 'gemma-4-31b',
    routingEnabled: true,
    models: [],
    cursorProxy: {
      baseUrl: 'http://168.107.36.218:8765/v1',
      selectedModelId: 'composer-2.5',
      models: [],
    },
    clinePass: {
      baseUrl: 'https://api.cline.bot',
      selectedModelId: 'cline-pass/qwen-3.7-plus',
      models: [],
      isAuthenticated: false,
      tokenExpiresAt: 0,
    },
  });
  const [settingsTab, setSettingsTab] = useState<'gemini' | 'cursor-proxy' | 'cline-pass'>('gemini');
  const [cursorProxyApiKey, setCursorProxyApiKey] = useState('');
  const [serverMaskedCursorApiKey, setServerMaskedCursorApiKey] = useState('');
  const [serverHasCursorApiKey, setServerHasCursorApiKey] = useState(false);
  const [isLoadingCursorModels, setIsLoadingCursorModels] = useState(false);
  const [cursorModelsLoadError, setCursorModelsLoadError] = useState<string | null>(null);
  const [cursorProxyHealth, setCursorProxyHealth] = useState<string | null>(null);

  const applyStaticGemmaModels = () => {
    setModelSettings((prev) => ({
      ...prev,
      models: GEMMA_MODEL_DEFINITIONS.map((def) => ({
        ...def,
        apiModelId: MODEL_API_MAP[def.id],
        inputTokenLimit: 0,
        outputTokenLimit: 0,
      })),
    }));
  };

  const loadCursorModelsFromApi = async () => {
    setIsLoadingCursorModels(true);
    setCursorModelsLoadError(null);
    setCursorProxyHealth(null);
    try {
      const healthRes = await fetch('/api/cursor-proxy/health');
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setCursorProxyHealth(healthData.health?.ok ? '연결됨' : '응답 이상');
      } else {
        setCursorProxyHealth('연결 실패');
      }

      const res = await fetch('/api/cursor-proxy/models');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `모델 목록 조회 실패 (${res.status})`);
      }
      const data = await res.json();
      const models: ModelConfig[] = (data.models || [])
        .filter((m: { id: string }) => m.id === 'composer-2.5')
        .map((m: { id: string; name?: string; description?: string; inputTokenLimit?: number; outputTokenLimit?: number }) => ({
          id: m.id,
          name: m.name || 'Composer 2.5',
          description: m.description || 'Cursor Proxy',
          inputTokenLimit: m.inputTokenLimit ?? 200_000,
          outputTokenLimit: m.outputTokenLimit ?? 0,
          used: 0,
        }));

      setModelSettings((prev) => {
        const hasSelected = models.some((m) => m.id === prev.cursorProxy.selectedModelId);
        const selectedModelId =
          hasSelected && !prev.cursorProxy.selectedModelId.includes('fast')
            ? prev.cursorProxy.selectedModelId
            : 'composer-2.5';
        return {
          ...prev,
          cursorProxy: {
            ...prev.cursorProxy,
            models,
            selectedModelId,
          },
        };
      });
    } catch (err: any) {
      setCursorModelsLoadError(err.message || 'Cursor Proxy 모델 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoadingCursorModels(false);
    }
  };

  const loadModelsFromApi = async () => {
    setIsLoadingModels(true);
    setModelsLoadError(null);
    try {
      const res = await fetch('/api/models');
      if (!res.ok) {
        throw new Error(`모델 목록 조회 실패 (${res.status})`);
      }
      const data = await res.json();
      const gemmaModels = buildGemmaModelsFromApi(data.models || []);

      setModelSettings(prev => {
        const usedById = Object.fromEntries(prev.models.map(m => [m.id, m.used || 0]));
        const modelsWithUsage = gemmaModels.map(m => ({
          ...m,
          used: usedById[m.id] ?? 0,
        }));
        const hasSelected = modelsWithUsage.some(m => m.id === prev.selectedModelId);
        return {
          ...prev,
          models: modelsWithUsage,
          selectedModelId: hasSelected ? prev.selectedModelId : 'gemma-4-31b',
        };
      });
    } catch (err: any) {
      console.error('Failed to load models from API:', err);
      setModelsLoadError(err.message || 'API에서 모델 목록을 불러오지 못했습니다.');
      applyStaticGemmaModels();
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Load configuration from server on mount
  useEffect(() => {
    const loadServerConfig = async () => {
      try {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
          const data = await res.json();
          setModelSettings(prev => ({
            ...prev,
            selectedModelId: data.selectedModelId || prev.selectedModelId,
            routingEnabled: data.routingEnabled,
          }));
          setServerMaskedApiKey(data.maskedApiKey || '');
          setServerHasApiKey(!!data.hasApiKey);
          if (data.activeProvider) {
            setModelSettings((prev) => ({
              ...prev,
              activeProvider: data.activeProvider,
            }));
          }
          if (data.cursorProxy) {
            setServerMaskedCursorApiKey(data.cursorProxy.maskedApiKey || '');
            setServerHasCursorApiKey(!!data.cursorProxy.hasApiKey);
            setModelSettings((prev) => ({
              ...prev,
              cursorProxy: {
                ...prev.cursorProxy,
                baseUrl: data.cursorProxy.baseUrl || prev.cursorProxy.baseUrl,
                selectedModelId: data.cursorProxy.selectedModelId || 'composer-2.5',
              },
            }));
            if (data.cursorProxy.hasApiKey) {
              loadCursorModelsFromApi();
            }
          }
          if (data.clinePass) {
            setModelSettings((prev) => ({
              ...prev,
              clinePass: {
                ...prev.clinePass,
                baseUrl: data.clinePass.baseUrl || prev.clinePass.baseUrl,
                selectedModelId: data.clinePass.selectedModelId || 'cline-pass/glm-5.2',
                isAuthenticated: !!data.clinePass.isAuthenticated,
                tokenExpiresAt: data.clinePass.tokenExpiresAt || 0,
              },
            }));
            // Cline Pass 모델 목록 로드 (정적 카탈로그)
            if (data.clinePass.isAuthenticated) {
              loadClinePassModels();
            }
          }
        }
      } catch (err) {
        console.error("Failed to load server config:", err);
      }
    };
    loadServerConfig();
    loadModelsFromApi();
  }, []);

  const loadClinePassModels = async () => {
    try {
      const res = await fetch('/api/cline-pass/models');
      if (res.ok) {
        const data = await res.json();
        const models: ModelConfig[] = (data.models || []).map((m: { id: string; name?: string; description?: string; inputTokenLimit?: number; outputTokenLimit?: number }) => ({
          id: m.id,
          name: m.name || m.id,
          description: m.description || 'Cline Pass',
          inputTokenLimit: m.inputTokenLimit ?? 202_752,
          outputTokenLimit: m.outputTokenLimit ?? 0,
          used: 0,
        }));
        setModelSettings((prev) => ({
          ...prev,
          clinePass: {
            ...prev.clinePass,
            models,
          },
        }));
      }
    } catch (err) {
      console.error('Failed to load Cline Pass models:', err);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    const password = adminPasswordInput.trim();
    if (!password) {
      setAdminError('비밀번호를 입력해 주세요.');
      return;
    }
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (res.ok) {
        const resGet = await fetch('/api/admin/settings');
        const data = await resGet.json();
        setModelSettings(prev => ({
          ...prev,
          selectedModelId: data.selectedModelId,
          routingEnabled: data.routingEnabled,
        }));
        setServerMaskedApiKey(data.maskedApiKey || '');
        setServerHasApiKey(!!data.hasApiKey);
        setServerMaskedCursorApiKey(data.cursorProxy?.maskedApiKey || '');
        setServerHasCursorApiKey(!!data.cursorProxy?.hasApiKey);
        setAdminApiKey(data.maskedApiKey || '');
        setCursorProxyApiKey(data.cursorProxy?.maskedApiKey || '');
        if (data.activeProvider) {
          setModelSettings((prev) => ({
            ...prev,
            activeProvider: data.activeProvider,
            cursorProxy: {
              ...prev.cursorProxy,
              baseUrl: data.cursorProxy?.baseUrl || prev.cursorProxy.baseUrl,
              selectedModelId: data.cursorProxy?.selectedModelId || 'composer-2.5',
            },
            clinePass: {
              ...prev.clinePass,
              baseUrl: data.clinePass?.baseUrl || prev.clinePass.baseUrl,
              selectedModelId: data.clinePass?.selectedModelId || 'cline-pass/glm-5.2',
              isAuthenticated: !!data.clinePass?.isAuthenticated,
              tokenExpiresAt: data.clinePass?.tokenExpiresAt || 0,
            },
          }));
        }
        setIsAdminAuthenticated(true);
        loadModelsFromApi();
        if (data.cursorProxy?.hasApiKey) loadCursorModelsFromApi();
        if (data.clinePass?.isAuthenticated) loadClinePassModels();
      } else {
        const errData = await res.json().catch(() => ({}));
        setAdminError(errData.error || '비밀번호가 올바르지 않습니다. (기본값: admin)');
      }
    } catch (err) {
      setAdminError('관리자 설정 서버 연결에 실패했습니다. 로컬이라면 npm run dev가 실행 중인지 확인해 주세요.');
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setAdminError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPasswordInput,
          geminiApiKey: adminApiKey,
          routingEnabled: modelSettings.routingEnabled,
          selectedModelId: modelSettings.selectedModelId,
          activeProvider: modelSettings.activeProvider,
          cursorProxyBaseUrl: modelSettings.cursorProxy.baseUrl,
          cursorProxyApiKey: cursorProxyApiKey,
          cursorSelectedModelId: modelSettings.cursorProxy.selectedModelId,
          clinePassBaseUrl: modelSettings.clinePass.baseUrl,
          clinePassSelectedModelId: modelSettings.clinePass.selectedModelId,
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(data.message || "설정이 전역적으로 안전하게 저장되었습니다.");
        setIsSettingsOpen(false);
        setIsAdminAuthenticated(false);
        setAdminPasswordInput('');
      } else {
        const errData = await res.json();
        setAdminError(errData.error || "설정 저장 실패");
      }
    } catch (err) {
      setAdminError("설정 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSavingSettings(false);
    }
  };


  // 1. Load initial data from localStorage
  useEffect(() => {
    const savedSessions = localStorage.getItem('buildme_sessions');
    const savedActiveId = localStorage.getItem('buildme_active_id');
    
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions).map((sess: BrainstormSession) => {
          let toc = repairTocSections(normalizeTocSections(sess.toc || []));
          const polluted =
            isInterviewQuestionToc(toc) &&
            (sess.status === 'writing' || sess.status === 'reviewing');
          if (polluted) {
            toc = [];
          }
          return {
            ...sess,
            toc,
            status: polluted ? ('interviewing' as const) : sess.status,
            currentSectionId: polluted ? null : sess.currentSectionId,
          };
        });
        setSessions(parsed);
        if (savedActiveId && parsed.some((s: any) => s.id === savedActiveId)) {
          setActiveSessionId(savedActiveId);
        } else if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
        }
      } catch (e) {
        console.error("Error parsing localStorage", e);
      }
    }
  }, []);

  // 2. Save sessions to localStorage on change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('buildme_sessions', JSON.stringify(sessions));
    } else {
      localStorage.removeItem('buildme_sessions');
    }
  }, [sessions]);

  // 3. Save activeId to localStorage on change
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('buildme_active_id', activeSessionId);
    } else {
      localStorage.removeItem('buildme_active_id');
    }
  }, [activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // 4. streamChat helper for real-time streaming reasoning parsing
  const deriveStreamPhase = (
    activeField: 'reasoning' | 'reply' | 'updatedContent' | 'critique' | 'none',
    fields: { reasoning: string; reply: string; updatedContent: string; critique: string }
  ): 'connecting' | 'reasoning' | 'draft' | 'reply' | 'critique' => {
    if (activeField === 'updatedContent' || fields.updatedContent) return 'draft';
    if (activeField === 'critique' || fields.critique) return 'critique';
    if (activeField === 'reply' || fields.reply) return 'reply';
    if (activeField === 'reasoning' || fields.reasoning) return 'reasoning';
    return 'connecting';
  };

  const streamChat = async (
    sessionState: BrainstormSession,
    userMessage: string,
    streamMeta?: { streamLabel?: string }
  ): Promise<any> => {
    setRealTimeProgress({
      reasoning: '',
      reply: '',
      updatedContent: '',
      critique: '',
      currentActiveField: 'none',
      streamPhase: 'connecting',
      streamLabel: streamMeta?.streamLabel,
    });
    const startTime = Date.now();

    clientDevLog('chat.client', 'Stream request started', {
      sessionId: sessionState.id,
      status: sessionState.status,
      userMessage: userMessage.slice(0, 200),
    });

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionState,
        userMessage,
        selectedModelId: modelSettings.selectedModelId,
        routingEnabled: modelSettings.routingEnabled,
        llmProvider: modelSettings.activeProvider,
        cursorSelectedModelId: modelSettings.cursorProxy.selectedModelId,
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMessage = res.statusText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error) errMessage = errJson.error;
      } catch {
        if (errText) errMessage = errText.slice(0, 200);
      }
      clientDevLog(
        'chat.client',
        'Stream HTTP error',
        { status: res.status, statusText: res.statusText, body: errText.slice(0, 500) },
        'error'
      );
      throw new Error(`API Error: ${errMessage}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      throw new Error("No stream reader available");
    }

    let receivedBuffer = "";
    let fullJsonBuffer = "";
    let modelUsed = "";
    let contextTokens = 0;
    let contextLimit = 0;
    let outputTokens = 0;
    let outputTokenLimit = 0;

    const extractJsonField = (buffer: string, fieldName: string): string => {
      const keyStr = `"${fieldName}"`;
      const keyIdx = buffer.indexOf(keyStr);
      if (keyIdx === -1) return "";
      
      const colonIdx = buffer.indexOf(':', keyIdx + keyStr.length);
      if (colonIdx === -1) return "";
      
      const quoteIdx = buffer.indexOf('"', colonIdx + 1);
      if (quoteIdx === -1) return "";
      
      const startIdx = quoteIdx + 1;
      let textResult = "";
      let escaped = false;
      
      for (let i = startIdx; i < buffer.length; i++) {
        const char = buffer[i];
        if (escaped) {
          if (char === 'n') textResult += '\n';
          else if (char === 't') textResult += '\t';
          else if (char === 'r') textResult += '\r';
          else if (char === '"') textResult += '"';
          else if (char === '\\') textResult += '\\';
          else textResult += char;
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          break;
        } else {
          textResult += char;
        }
      }
      return textResult;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBuffer += decoder.decode(value, { stream: true });
      const lines = receivedBuffer.split("\n");
      receivedBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        let parsed: {
          type?: string;
          text?: string;
          message?: string;
          model?: string;
          phase?: string;
          fallback?: boolean;
          modelUsed?: string;
          contextTokens?: number;
          contextLimit?: number;
          outputTokens?: number;
          outputTokenLimit?: number;
        };
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        if (parsed.type === "chunk") {
          fullJsonBuffer += parsed.text || "";

          const reasoning = extractJsonField(fullJsonBuffer, "reasoning");
          const reply = extractJsonField(fullJsonBuffer, "reply");
          const updatedContent = extractJsonField(fullJsonBuffer, "updatedContent");
          const critique = extractJsonField(fullJsonBuffer, "critique");

          let activeField: 'reasoning' | 'reply' | 'updatedContent' | 'critique' | 'none' = 'none';
          if (fullJsonBuffer.includes('"reasoning"')) activeField = 'reasoning';
          if (fullJsonBuffer.includes('"reply"')) activeField = 'reply';
          if (fullJsonBuffer.includes('"updatedContent"')) activeField = 'updatedContent';
          if (fullJsonBuffer.includes('"critique"')) activeField = 'critique';

          setRealTimeProgress((prev) => ({
            ...prev,
            reasoning,
            reply,
            updatedContent,
            critique,
            currentActiveField: activeField,
            streamPhase: deriveStreamPhase(activeField, { reasoning, reply, updatedContent, critique }),
          }));
        } else if (parsed.type === "status") {
          const modelName = parsed.model ? String(parsed.model) : "";
          const isFallback = Boolean(parsed.fallback);
          const phase = parsed.phase ? String(parsed.phase) : "";
          let streamLabel = modelName ? `${modelName} 호출 중…` : "에이전트 연결 중…";
          if (phase === "model_attempt" && isFallback) {
            streamLabel = `주 모델 실패 → 백업 모델(${modelName})로 전환 중…`;
          } else if (phase === "streaming" && isFallback) {
            streamLabel = `백업 모델(${modelName})이 응답 작성 중…`;
          } else if (phase === "streaming") {
            streamLabel = `${modelName} 응답 작성 중…`;
          }
          setRealTimeProgress((prev) => ({
            ...prev,
            streamPhase: phase === "streaming" ? prev.streamPhase || "reasoning" : "connecting",
            streamLabel,
          }));
        } else if (parsed.type === "metadata") {
          modelUsed = parsed.modelUsed || "";
          contextTokens = parsed.contextTokens || 0;
          contextLimit = parsed.contextLimit || 0;
          outputTokens = parsed.outputTokens || 0;
          outputTokenLimit = parsed.outputTokenLimit || 0;
        } else if (parsed.type === "error") {
          clientDevLog('chat.client', 'Stream error chunk', { message: parsed.message }, 'error');
          throw new Error(parsed.message || "서버 스트리밍 오류");
        }
      }
    }

    if (!fullJsonBuffer) {
      clientDevLog('chat.client', 'Empty stream buffer', { sessionId: sessionState.id }, 'error');
      throw new Error("No data received from AI engine");
    }

    const cleanAndParseJson = (text: string) => {
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "");
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.replace(/\s*```$/, "");
      }
      cleaned = cleaned.trim();

      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      return JSON.parse(cleaned);
    };

    const parseModelResponse = (text: string) => {
      let data: any;
      try {
        data = cleanAndParseJson(text);
      } catch (parseErr) {
        const reply = extractJsonField(text, 'reply');
        const reasoning = extractJsonField(text, 'reasoning');
        if (reply || reasoning) {
          data = {
            reply: reply || '응답을 일부만 복구했습니다. 내용이 이상하면 다시 보내 주세요.',
            reasoning,
            updatedContent: extractJsonField(text, 'updatedContent'),
            critique: extractJsonField(text, 'critique'),
            sessionStatus: sessionState.status,
          };
        } else {
          throw new Error(
            parseErr instanceof Error
              ? `AI 응답 형식 오류: ${parseErr.message}`
              : 'AI 응답 형식 오류'
          );
        }
      }

      if (!data.suggestedToc?.length) {
        const extracted = extractSuggestedTocFromJsonBuffer(text);
        if (extracted?.length) {
          data.suggestedToc = extracted;
        }
      }

      if (!data.suggestedToc?.length && data.reply) {
        const wantsTocUpdate =
          sessionState.toc.length === 0 ||
          userRequestsTocUpdate(userMessage, data.reply);
        if (wantsTocUpdate) {
          const fromReply = parseTocOutlineFromReply(data.reply);
          if (fromReply.length) {
            data.suggestedToc = fromReply;
          }
        }
      }

      if (data.suggestedToc?.length) {
        data.suggestedToc = filterDocumentTocSections(data.suggestedToc);
      }

      if (data.suggestedToc?.length) {
        if (!data.sessionStatus || data.sessionStatus === 'interviewing') {
          data.sessionStatus = 'writing';
        }
        if (!data.currentSectionId) {
          const first = findNextWritableSection(normalizeTocSections(data.suggestedToc));
          if (first) data.currentSectionId = first.id;
        }
      } else {
        delete data.suggestedToc;
        if (data.sessionStatus === 'writing' && sessionState.status === 'interviewing') {
          data.sessionStatus = 'interviewing';
        }
      }

      return data;
    };

    const data = parseModelResponse(fullJsonBuffer);
    
    // Inject metadata if any
    if (modelUsed) {
      data.modelUsed = modelUsed;
    }
    if (contextTokens) {
      data.contextTokens = contextTokens;
    }
    if (contextLimit) {
      data.contextLimit = contextLimit;
    }
    if (outputTokens) {
      data.outputTokens = outputTokens;
    }
    if (outputTokenLimit) {
      data.outputTokenLimit = outputTokenLimit;
    }

    clientDevLog('chat.client', 'Stream parsed successfully', {
      sessionId: sessionState.id,
      durationMs: Date.now() - startTime,
      modelUsed: data.modelUsed,
      hasReply: !!data.reply,
      hasUpdatedContent: !!data.updatedContent,
      suggestedTocCount: data.suggestedToc?.length ?? 0,
      sessionStatus: data.sessionStatus,
    });
    
    return data;
  };

  const applyModelResponseToSession = (
    sess: BrainstormSession,
    data: any,
    modelMsg: ChatMessage,
    userMessage?: string
  ): BrainstormSession => {
    let updatedToc = applySuggestedToc(
      sess.toc,
      data.suggestedToc,
      data.reply || modelMsg.text,
      { sessionStatus: sess.status, userMessage }
    );
    const targetSectionId = data.currentSectionId || sess.currentSectionId;

    if (targetSectionId && data.updatedContent) {
      const pureContent = sanitizeDraftContent(data.updatedContent);
      updatedToc = updatedToc.map((sec) => {
        if (sec.id === targetSectionId) {
          return {
            ...sec,
            content: pureContent,
            status: sec.status === 'pending' ? ('writing' as const) : sec.status,
          };
        }
        return sec;
      });
    }

    if (targetSectionId && data.critique) {
      updatedToc = updatedToc.map((sec) => {
        if (sec.id === targetSectionId) {
          return {
            ...sec,
            status: 'reviewing' as const,
          };
        }
        return sec;
      });
    }

    let nextSectionId = data.currentSectionId || sess.currentSectionId;
    if (nextSectionId && !updatedToc.some((s) => s.id === nextSectionId)) {
      nextSectionId = '';
    }
    if (!nextSectionId && (data.sessionStatus === 'writing' || sess.status === 'writing')) {
      const firstWritable = findNextWritableSection(updatedToc);
      if (firstWritable) nextSectionId = firstWritable.id;
    }

    return {
      ...sess,
      history: [...sess.history, modelMsg],
      toc: updatedToc,
      status:
        updatedToc.length > 0 || sess.status !== 'interviewing'
          ? data.sessionStatus || sess.status
          : 'interviewing',
      currentSectionId: nextSectionId,
      updatedAt: new Date().toISOString(),
    };
  };

  const buildChapterReviewPrompt = (toc: TocSection[], chapterNum: string) => {
    const body = buildChapterReviewMarkdown(toc, chapterNum);
    return `[대목차 검토] ${chapterNum}번 대목차의 모든 소목차 확정이 완료되었습니다.
아래 확정 집필 본문만 검토해 주세요. 중복·누락·흐름·모순·용어 일관성을 점검합니다.

- reply: 검토 요약 및 개선 제안 (자연스러운 대화체)
- critique: 비워 두세요("")
- updatedContent 보내지 마세요
- suggestedToc 보내지 마세요
- sessionStatus: "reviewing"

---
${body}`;
  };

  const buildFullDocumentReviewPrompt = (toc: TocSection[]) => {
    const body = buildConfirmedContentMarkdown(toc);
    return `[전체 기획서 검토] 모든 섹션 집필이 완료되었습니다.
아래 확정 본문 전체를 통독하여 전체 일관성·중복·흐름·모순을 검토해 주세요.

- reply에만 검토 결과를 자연스럽게 작성
- updatedContent, suggestedToc 보내지 마세요
- sessionStatus: "completed"

---
${body}`;
  };

  const triggerChapterReview = async (session: BrainstormSession, chapterNum: string) => {
    const body = buildChapterReviewMarkdown(session.toc, chapterNum);
    if (!body || isLoading) return session;
    setMobileActiveTab('chat');
    const result = await executeChatRound(session, buildChapterReviewPrompt(session.toc, chapterNum));
    return result?.nextSession ?? session;
  };

  const triggerFullDocumentReview = async (session: BrainstormSession) => {
    const body = buildConfirmedContentMarkdown(session.toc);
    if (!body || isLoading) return session;
    setMobileActiveTab('chat');
    const result = await executeChatRound(session, buildFullDocumentReviewPrompt(session.toc));
    return result?.nextSession ?? session;
  };

  const buildSectionDraftPrompt = (section: TocSection, toc: TocSection[]) =>
    `[자동 집필 시작] "${getSectionDisplayLabel(section, toc)}" 섹션 초안을 작성해 주세요.
- updatedContent: 기획서 본문만 (설명·비평·인사 없이 순수 마크다운 본문)
- reply: 왜 이렇게 썼는지, 구성 의도, 핵심 포인트 설명 (대화창용)
- critique: 보통 비움("")
- currentSectionId: "${section.id}"
- suggestedToc 보내지 마세요
- sessionStatus: "reviewing"`;

  const executeChatRound = async (
    session: BrainstormSession,
    text: string,
    options?: { streamLabel?: string; hideUserMessage?: boolean }
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    setRealTimeProgress({
      reasoning: '',
      reply: '',
      updatedContent: '',
      critique: '',
      currentActiveField: 'none',
      streamPhase: 'connecting',
      streamLabel: options?.streamLabel,
    });

    const userMsg: ChatMessage | null = options?.hideUserMessage
      ? null
      : {
          id: `msg_user_${Date.now()}`,
          role: 'user',
          text,
          timestamp: new Date().toISOString(),
          type: 'chat',
        };

    const sessionWithUser: BrainstormSession = userMsg
      ? {
          ...session,
          history: [...session.history, userMsg],
          updatedAt: new Date().toISOString(),
        }
      : session;

    if (userMsg) {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? sessionWithUser : s)));
    }

    const startTime = Date.now();

    try {
      const data = await streamChat(sessionWithUser, text, { streamLabel: options?.streamLabel });
      const elapsed = (Date.now() - startTime) / 1000;

      if (data.modelUsed) {
        const isCursor = data.modelUsed.startsWith('cursor:');
        const isClinePass = data.modelUsed.startsWith('clinepass:');
        const rawId = isCursor
          ? data.modelUsed.replace(/^cursor:/, '')
          : isClinePass
            ? data.modelUsed.replace(/^clinepass:/, '')
            : data.modelUsed;
        setModelSettings((prev) => ({
          ...prev,
          models: isCursor || isClinePass
            ? prev.models
            : prev.models.map((m) =>
                m.id === rawId ? { ...m, used: (m.used || 0) + 1 } : m
              ),
          cursorProxy: isCursor
            ? {
                ...prev.cursorProxy,
                models: prev.cursorProxy.models.map((m) =>
                  m.id === rawId ? { ...m, used: (m.used || 0) + 1 } : m
                ),
              }
            : prev.cursorProxy,
          clinePass: isClinePass
            ? {
                ...prev.clinePass,
                models: prev.clinePass.models.map((m) =>
                  m.id === rawId ? { ...m, used: (m.used || 0) + 1 } : m
                ),
              }
            : prev.clinePass,
        }));
      }

      const chatText =
        buildModelChatText(data.reply, data.critique) ||
        (data.updatedContent
          ? '집필 초안을 작성했습니다. 오른쪽 **집필 초안** 탭에서 본문을 확인하고, 여기서 피드백을 주세요.'
          : data.reply || '');

      const modelMsg: ChatMessage = {
        id: `msg_model_${Date.now()}`,
        role: 'model',
        text: chatText,
        timestamp: new Date().toISOString(),
        type: 'chat',
        reasoning: data.reasoning,
        reasoningTime: elapsed,
        contextTokens: data.contextTokens,
        contextLimit: data.contextLimit,
        outputTokens: data.outputTokens,
        outputTokenLimit: data.outputTokenLimit,
        modelUsed: data.modelUsed,
      };

      let nextSession: BrainstormSession | null = null;

      setSessions((prev) =>
        prev.map((sess) => {
          if (sess.id !== session.id) return sess;
          const updated = applyModelResponseToSession(sess, data, modelMsg, text);
          nextSession = updated;
          return updated;
        })
      );

      return { data, nextSession };
    } catch (err: any) {
      console.error(err);
      const detail = err?.message ? String(err.message) : '알 수 없는 오류';
      clientDevLog(
        'chat.client',
        'Chat round failed',
        { sessionId: session.id, error: detail, userMessage: text.slice(0, 200) },
        'error'
      );
      setErrorMessage(
        detail.includes('API Error') || detail.includes('AI 응답')
          ? detail
          : `답변을 처리하는 도중 오류가 발생했습니다. (${detail})`
      );
      return null;
    } finally {
      setIsLoading(false);
      setRealTimeProgress({
        reasoning: '',
        reply: '',
        updatedContent: '',
        critique: '',
        currentActiveField: 'none',
      });
    }
  };

  const triggerSectionDraft = async (session: BrainstormSession, section: TocSection) => {
    if (isLoading || !section || section.isGroupHeader) return;
    const label = getSectionDisplayLabel(section, session.toc);
    setMobileActiveTab('chat');
    await executeChatRound(session, buildSectionDraftPrompt(section, session.toc), {
      streamLabel: `'${label}' 집필 중`,
      hideUserMessage: true,
    });
  };

  // 4. Create new Brainstorming Session
  const handleCreateSession = async (rawIdea: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setRealTimeProgress({
      reasoning: '',
      reply: '',
      updatedContent: '',
      critique: '',
      currentActiveField: 'none'
    });
    const newSessionId = `sess_${Date.now()}`;
    
    // Create skeleton session
    const skeletonSession: BrainstormSession = {
      id: newSessionId,
      title: rawIdea.slice(0, 18) + (rawIdea.length > 18 ? '...' : ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'interviewing',
      toc: [],
      history: [
        {
          id: `msg_init`,
          role: 'system',
          text: `[시스템 안내] 새로운 아이디어 브레인스토밍을 생성했습니다. AI가 기획 인터뷰를 위해 생각을 시작합니다.`,
          timestamp: new Date().toISOString(),
          type: 'system_alert'
        }
      ],
      currentSectionId: null,
      rawIdea: rawIdea,
    };

    setSessions(prev => [skeletonSession, ...prev]);
    setActiveSessionId(newSessionId);

    try {
      const data = await streamChat(
        skeletonSession,
        `안녕! 나는 이 아이디어를 바탕으로 기획서를 발전시키고 싶어: "${rawIdea}"`
      );
      
      const firstModelMsg: ChatMessage = {
        id: `msg_model_first`,
        role: 'model',
        text: buildModelChatText(data.reply, data.critique) || data.reply,
        timestamp: new Date().toISOString(),
        type: 'chat',
        contextTokens: data.contextTokens,
        contextLimit: data.contextLimit,
        outputTokens: data.outputTokens,
        outputTokenLimit: data.outputTokenLimit,
        modelUsed: data.modelUsed
      };

      setSessions(prev => prev.map(sess => {
        if (sess.id === newSessionId) {
          const updatedToc = applySuggestedToc([], data.suggestedToc, data.reply);
          const hasRealToc = updatedToc.length > 0;
          return {
            ...sess,
            title: hasRealToc && data.suggestedToc?.[0]?.title
              ? data.suggestedToc[0].title
              : sess.title,
            history: [...sess.history, firstModelMsg],
            toc: updatedToc,
            status: hasRealToc ? (data.sessionStatus || 'writing') : 'interviewing',
            currentSectionId: hasRealToc ? (data.currentSectionId || findNextWritableSection(updatedToc)?.id || null) : null,
            updatedAt: new Date().toISOString()
          };
        }
        return sess;
      }));

    } catch (err: any) {
      console.error(err);
      const detail = err?.message ? String(err.message) : '알 수 없는 오류';
      const isGemini = modelSettings.activeProvider === 'gemini';
      setErrorMessage(
        detail.includes('API Error') || detail.includes('AI 응답')
          ? detail.replace(/^API Error:\s*/, '')
          : isGemini
            ? '서버와 연동하는 도중 오류가 발생했습니다. 환경설정에 GEMINI_API_KEY가 정상 등록되어 있는지 확인해주세요.'
            : `서버와 연동하는 도중 오류가 발생했습니다. (${detail})`
      );
    } finally {

      setIsLoading(false);
      setRealTimeProgress({
        reasoning: '',
        reply: '',
        updatedContent: '',
        critique: '',
        currentActiveField: 'none'
      });
    }
  };

  // 5. Delete Brainstorming Session
  const handleDeleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
      } else {
        setActiveSessionId(null);
      }
    }
  };

  // 6. Send User Message and process AI Response
  const handleSendMessage = async (text: string) => {
    if (!activeSession || isLoading) return;

    const trimmedText = text.trim();
    if ((trimmedText === '확정' || trimmedText === '저장') && activeSession.currentSectionId) {
      await handleConfirmSection();
      return;
    }

    const result = await executeChatRound(activeSession, text);
    if (!result?.nextSession) return;

    let session = result.nextSession;

    const needsTocFollowup =
      (activeSession.toc.length === 0 &&
        session.toc.length === 0 &&
        shouldRequestTocFromAi(result.data)) ||
      (userRequestsTocUpdate(trimmedText, result.data.reply) &&
        session.toc.length === activeSession.toc.length &&
        !result.data.suggestedToc?.length);

    if (needsTocFollowup) {
      const followUp = await executeChatRound(session, TOC_JSON_FOLLOWUP_PROMPT);
      if (followUp?.nextSession) session = followUp.nextSession;
    }

    const targetId = session.currentSectionId;
    let targetSection = targetId ? session.toc.find((s) => s.id === targetId) : null;
    if (!targetSection) {
      targetSection = findNextWritableSection(session.toc) || undefined;
    }
    const justGotToc = activeSession.toc.length === 0 && session.toc.length > 0;
    const startedWriting = activeSession.status !== 'writing' && session.status === 'writing';
    const needsAutoDraft =
      targetSection &&
      !targetSection.content &&
      (justGotToc || startedWriting);

    if (needsAutoDraft && targetSection) {
      await triggerSectionDraft(session, targetSection);
    }
  };

  // 7. Manual select/focus section in TOC
  const handleSelectSection = (sectionId: string) => {
    if (!activeSession) return;

    setMobileActiveTab('doc');
    setSessions((prev) =>
      prev.map((sess) => {
        if (sess.id !== activeSession.id) return sess;

        const updatedToc = sess.toc.map((sec) => {
          if (sec.id === sectionId && sec.status === 'pending') {
            return { ...sec, status: 'writing' as const };
          }
          return sec;
        });

        return {
          ...sess,
          currentSectionId: sectionId,
          status: 'writing' as const,
          toc: updatedToc,
        };
      })
    );
  };

  // 8. Manual update of entire TOC structure
  const handleUpdateToc = (newToc: TocSection[]) => {
    if (!activeSession) return;
    setSessions(prev => prev.map(sess => {
      if (sess.id === activeSession.id) {
        return {
          ...sess,
          toc: normalizeTocSections(newToc),
          updatedAt: new Date().toISOString()
        };
      }
      return sess;
    }));
  };

  // 9. Confirm / Save current Section to Wiki
  const handleConfirmSection = async () => {
    if (!activeSession || !activeSession.currentSectionId || isLoading) return;

    const currentSecId = activeSession.currentSectionId;
    const currentSection = activeSession.toc.find((s) => s.id === currentSecId);
    if (!currentSection) return;

    const updatedToc = activeSession.toc.map((sec) =>
      sec.id === currentSecId ? { ...sec, status: 'completed' as const } : sec
    );

    const nextSec = findNextWritableSection(updatedToc);
    const nextSecId = nextSec ? nextSec.id : null;
    const chapterNum = getChapterNumberForSection(currentSecId, updatedToc);
    const chapterJustDone = isChapterJustCompleted(currentSecId, updatedToc);

    const confirmAlert: ChatMessage = {
      id: `confirm_${Date.now()}`,
      role: 'system',
      text: `[확정 및 저장] '${getSectionDisplayLabel(currentSection, activeSession.toc)}' 섹션이 성공적으로 기획 위키에 영구 저장되었습니다.`,
      timestamp: new Date().toISOString(),
      type: 'system_alert',
    };

    const reviewAlert: ChatMessage | null = !nextSec
      ? {
          id: `review_full_${Date.now()}`,
          role: 'system',
          text: '[전체 검토] 확정된 기획서 전체를 통독 검토합니다…',
          timestamp: new Date().toISOString(),
          type: 'system_alert',
        }
      : chapterJustDone && chapterNum
        ? {
            id: `review_ch_${Date.now()}`,
            role: 'system',
            text: `[대목차 검토] ${chapterNum}번 대목차 확정본을 검토한 뒤 다음 섹션으로 넘어갑니다.`,
            timestamp: new Date().toISOString(),
            type: 'system_alert',
          }
        : null;

    const nextAlert: ChatMessage = nextSec
      ? {
          id: `next_${Date.now()}`,
          role: 'system',
          text: `[다음 단계 진입] 다음 섹션인 '${getSectionDisplayLabel(nextSec, updatedToc)}' 집필을 시작합니다.`,
          timestamp: new Date().toISOString(),
          type: 'system_alert',
        }
      : {
          id: `next_${Date.now()}`,
          role: 'system',
          text: '🎉 모든 기획서 섹션이 완성되었습니다! 전체 기획 위키 탭을 확인하고 문서를 복사 또는 다운로드해 보세요.',
          timestamp: new Date().toISOString(),
          type: 'system_alert',
        };

    const tocWithNextWriting = nextSecId
      ? updatedToc.map((sec) =>
          sec.id === nextSecId ? { ...sec, status: 'writing' as const } : sec
        )
      : updatedToc;

    const updatedSession: BrainstormSession = {
      ...activeSession,
      toc: tocWithNextWriting,
      currentSectionId: nextSecId,
      status: nextSec ? ('writing' as const) : ('completed' as const),
      history: [
        ...activeSession.history,
        confirmAlert,
        ...(reviewAlert ? [reviewAlert] : []),
        nextAlert,
      ],
      updatedAt: new Date().toISOString(),
    };

    setSessions((prev) => prev.map((sess) => (sess.id === activeSession.id ? updatedSession : sess)));

    let sessionAfterReview: BrainstormSession = updatedSession;

    if (!nextSec) {
      sessionAfterReview = await triggerFullDocumentReview(updatedSession);
    } else if (chapterJustDone && chapterNum) {
      sessionAfterReview = await triggerChapterReview(updatedSession, chapterNum);
    }

    const freshNext = findNextWritableSection(sessionAfterReview.toc);
    if (freshNext && !freshNext.content) {
      setMobileActiveTab('chat');
      await triggerSectionDraft(sessionAfterReview, { ...freshNext, status: 'writing' });
    } else if (!freshNext) {
      setMobileActiveTab('doc');
    }
  };

  const handleDownloadWiki = () => {
    if (!activeSession || activeSession.toc.length === 0) {
      alert("다운로드할 위키 문서가 없습니다. 먼저 기획안 목차를 도출해 주세요.");
      return;
    }

    const fullText = buildFullWikiMarkdown(activeSession.toc);

    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `buildme-wiki-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentSection = activeSession?.toc.find(s => s.id === activeSession.currentSectionId) || null;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-natural-bg text-natural-text font-sans antialiased overflow-hidden" id="app-root-container">
      {/* 좌측 끝 호버 시 사이드바 펼침 (데스크톱) */}
      {!isDesktopSidebarExpanded && (
        <div
          className="hidden md:block fixed left-0 top-0 bottom-0 w-3 z-40"
          aria-hidden
          onMouseEnter={() => setIsDesktopSidebarExpanded(true)}
        />
      )}

      {/* Sidebar for navigation */}
      <div
        className={`${
          activeSessionId && !isSidebarOpenOnMobile ? 'hidden' : 'flex'
        } md:flex shrink-0 h-full transition-[width] duration-200 ease-out overflow-hidden ${
          isDesktopSidebarExpanded ? 'md:w-80' : 'md:w-14'
        } w-full`}
        id="sidebar-wrapper-responsive"
        onMouseEnter={() => {
          sidebarHoverRef.current = true;
          if (sidebarCollapseTimerRef.current) clearTimeout(sidebarCollapseTimerRef.current);
          setIsDesktopSidebarExpanded(true);
        }}
        onMouseLeave={() => {
          sidebarHoverRef.current = false;
          scheduleSidebarCollapse();
        }}
      >
        <Sidebar
          collapsed={!isDesktopSidebarExpanded}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            setIsSidebarOpenOnMobile(false);
          }}
          onDeleteSession={handleDeleteSession}
          onCreateSession={(rawIdea) => {
            handleCreateSession(rawIdea);
            setIsSidebarOpenOnMobile(false);
          }}
        />
      </div>

      {/* Main Workspace Area */}
      <div className={`${activeSessionId && !isSidebarOpenOnMobile ? 'flex' : 'hidden md:flex'} flex-1 flex flex-col h-full overflow-hidden bg-natural-bg`} id="main-workspace">
        {/* Workspace Top Header Bar */}
        <header className="shrink-0 h-14 border-b border-natural-border px-3 md:px-6 flex items-center justify-between bg-natural-card">
          <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
            {activeSession && (
              <button
                onClick={() => setIsSidebarOpenOnMobile(true)}
                className="md:hidden px-2 py-1 bg-natural-bg border border-natural-border hover:bg-natural-accent/10 text-natural-title text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all shrink-0"
                title="프로젝트 목록 보기"
              >
                📁 목록
              </button>
            )}
            <span className="text-xl hidden md:inline">🌱</span>
            <span className="font-serif font-bold text-sm text-natural-title shrink-0">
              <span className="sm:hidden">BuildMe</span>
              <span className="hidden sm:inline">BuildMe 아이디어 빌더</span>
            </span>
            {activeSession && (
              <span className="text-[9px] md:text-[10px] bg-natural-accent/10 border border-natural-accent/20 text-natural-accent px-1.5 py-0.5 rounded-full font-mono font-medium shrink-0 hidden lg:inline-block">
                {activeSession.status === 'interviewing' && 'Phase 1: 인터뷰 & 브레인스토밍'}
                {activeSession.status === 'writing' && 'Phase 3: 단계별 집필'}
                {activeSession.status === 'reviewing' && 'Phase 3: 피드백 조율'}
                {activeSession.status === 'completed' && '완료된 기획서'}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setSettingsTab(modelSettings.activeProvider === 'cursor-proxy' ? 'cursor-proxy' : 'gemini');
                setIsSettingsOpen(true);
              }}
              className="px-2 py-1.5 md:px-3 bg-natural-bg hover:bg-natural-accent/10 border border-natural-border text-natural-title text-[11px] font-medium rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              title="모델 설정 및 한도 보기"
            >
              <Settings className="w-3.5 h-3.5 text-natural-text/60" />
              <span className="hidden sm:inline">모델 설정</span>
              <span className="sm:hidden text-[10px]">설정</span>
            </button>
          </div>
        </header>

        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 text-rose-700 text-xs py-3 px-6 text-center font-medium animate-pulse shadow-xs" id="error-banner">
            ⚠️ {errorMessage}
          </div>
        )}

        {activeSession ? (
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* Mobile View Tab Switcher */}
            <div className="flex lg:hidden bg-natural-card border-b border-natural-border px-3 py-1.5 gap-2 shrink-0">
              <button
                onClick={() => setMobileActiveTab('chat')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  mobileActiveTab === 'chat'
                    ? 'bg-natural-accent text-white shadow-xs'
                    : 'bg-natural-bg border border-natural-border text-natural-text'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>대화 <span className="hidden sm:inline">나누기</span> ({activeSession.history.filter(m => m.role !== 'system').length})</span>
              </button>
              <button
                onClick={() => setMobileActiveTab('doc')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  mobileActiveTab === 'doc'
                    ? 'bg-natural-accent text-white shadow-xs'
                    : 'bg-natural-bg border border-natural-border text-natural-text'
                }`}
              >
                <FileIcon className="w-3.5 h-3.5" />
                <span>목차 <span className="hidden sm:inline">/ 기획 위키</span> ({activeSession.toc.length})</span>
              </button>
            </div>

            <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden h-full" id="workspace-grid">
              {/* 데스크톱: 드래그로 너비 조절 / 모바일: 탭 전환 */}
              <div className="hidden lg:flex flex-1 min-h-0">
                <ResizableSplitPane
                  storageKey="buildme_chat_panel_percent"
                  left={
                    <div
                      className="flex flex-col h-full min-h-0 pr-2"
                      id="chat-panel-hover-zone"
                      {...chatPanelInteractionProps}
                    >
                      <ChatPanel
                        history={activeSession.history}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                        status={activeSession.status}
                        currentSectionTitle={currentSection?.title || null}
                        onConfirmSection={handleConfirmSection}
                        onDownloadWiki={handleDownloadWiki}
                        realTimeProgress={realTimeProgress}
                      />
                    </div>
                  }
                  right={
                    <div className="flex flex-col h-full min-h-0 pl-2">
                      <DocPreview
                        currentSection={currentSection}
                        toc={activeSession.toc}
                        currentSectionId={activeSession.currentSectionId}
                        onSelectSection={handleSelectSection}
                        onUpdateToc={handleUpdateToc}
                        onConfirmSection={handleConfirmSection}
                        isLoading={isLoading}
                        streamingDraft={
                          isLoading && realTimeProgress.currentActiveField === 'updatedContent'
                            ? sanitizeDraftContent(realTimeProgress.updatedContent)
                            : ''
                        }
                      />
                    </div>
                  }
                />
              </div>

              <div
                className={`lg:hidden flex-1 min-h-0 flex flex-col ${mobileActiveTab === 'chat' ? 'flex' : 'hidden'}`}
                id="chat-panel-hover-zone-mobile"
                {...chatPanelInteractionProps}
              >
                <ChatPanel
                  history={activeSession.history}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  status={activeSession.status}
                  currentSectionTitle={currentSection?.title || null}
                  onConfirmSection={handleConfirmSection}
                  onDownloadWiki={handleDownloadWiki}
                  realTimeProgress={realTimeProgress}
                />
              </div>

              <div className={`lg:hidden flex-1 min-h-0 flex flex-col ${mobileActiveTab === 'doc' ? 'flex' : 'hidden'}`}>
                <DocPreview
                  currentSection={currentSection}
                  toc={activeSession.toc}
                  currentSectionId={activeSession.currentSectionId}
                  onSelectSection={handleSelectSection}
                  onUpdateToc={handleUpdateToc}
                  onConfirmSection={handleConfirmSection}
                  isLoading={isLoading}
                  streamingDraft={
                    isLoading && realTimeProgress.currentActiveField === 'updatedContent'
                      ? sanitizeDraftContent(realTimeProgress.updatedContent)
                      : ''
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          /* Empty / Welcome State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto" id="welcome-container">
            <div className="w-16 h-16 rounded-full bg-natural-accent flex items-center justify-center shadow-md mb-6 animate-pulse">
              <span className="text-3xl">🌱</span>
            </div>
            
            <h1 className="text-3xl font-extrabold tracking-tight text-natural-title mb-2 font-serif">
              아이디어 빌더, BuildMe
            </h1>
            <p className="text-xs text-natural-text/80 mb-8 max-w-md leading-relaxed">
              머릿속에 떠다니는 생각과 투박한 사업 비전을 던져주세요. 날카로운 인터뷰 질문과 솔직한 피드백을 나누며 견고한 위키 기획서로 함께 조각합니다.
            </p>

            <div className="w-full bg-natural-card border border-natural-border p-5 rounded-2xl shadow-md mb-6 text-left" id="welcome-input-box">
              <h3 className="text-[10px] font-bold uppercase text-natural-text/50 tracking-widest mb-3 font-mono">거친 아이디어 적고 시작하기</h3>
              <textarea
                id="input-welcome-idea"
                placeholder="예: 근처 동네 독립서점을 기반으로 동네 사람끼리 책을 하루씩 빌려보고 토론하는 '하이퍼 로컬 독서 동아리 플랫폼' 기획하고 싶어."
                className="w-full bg-natural-bg border border-natural-border rounded-xl p-3 text-xs text-natural-title placeholder-natural-text/40 min-h-[90px] focus:outline-none focus:ring-1 focus:ring-natural-accent"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const val = (e.target as HTMLTextAreaElement).value;
                    if (val.trim()) {
                      handleCreateSession(val);
                    }
                  }
                }}
              />
              <div className="flex justify-between items-center mt-3 text-[10px] text-natural-text/50 font-mono">
                <span>Enter를 눌러 즉시 시작</span>
                <button
                  id="btn-welcome-start"
                  onClick={() => {
                    const el = document.getElementById('input-welcome-idea') as HTMLTextAreaElement;
                    if (el?.value.trim()) {
                      handleCreateSession(el.value);
                    }
                  }}
                  className="px-3.5 py-1.5 bg-natural-accent hover:bg-natural-accent-hover text-white font-semibold rounded-lg transition-all flex items-center gap-1 text-xs cursor-pointer shadow-sm"
                >
                  기획 빌드업
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full text-left" id="welcome-guides">
              <div className="p-3.5 bg-natural-card border border-natural-border/60 rounded-xl shadow-xs">
                <span className="text-xs font-bold text-natural-title block mb-1 font-serif">📋 목차 (TOC)</span>
                <p className="text-[10px] text-natural-text/70 leading-relaxed">
                  기획의 뼈대가 되는 목차를 AI가 대화 흐름에 맞춰 실시간으로 구성하고 다듬으며, 사용자는 전체 기획서의 골격과 진행도를 한눈에 확인할 수 있습니다.
                </p>
              </div>
              <div className="p-3.5 bg-natural-card border border-natural-border/60 rounded-xl shadow-xs">
                <span className="text-xs font-bold text-natural-title block mb-1 font-serif">✏️ 집필 초안 & 전문 위키</span>
                <p className="text-[10px] text-natural-text/70 leading-relaxed">
                  각 세부 목차 항목의 전문적인 내용 초안을 공동 작성하고, 확정 시 전체 기획 위키(전문)에 실시간으로 병합·저장됩니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Model settings and Quota monitor modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-natural-card border border-natural-border rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-natural-border bg-natural-bg/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Settings className="w-4 h-4 text-natural-accent animate-spin-slow shrink-0" />
                <h2 className="text-xs md:text-sm font-bold text-natural-title font-serif truncate">
                  {!isAdminAuthenticated ? "🔒 관리자 인증" : "⚙️ LLM 전역 환경설정"}
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIsAdminAuthenticated(false);
                  setAdminPasswordInput('');
                  setAdminError(null);
                }}
                className="w-6 h-6 rounded-full bg-natural-bg hover:bg-natural-border flex items-center justify-center text-[10px] text-natural-text cursor-pointer transition-all shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            {!isAdminAuthenticated ? (
              <form onSubmit={handleAdminLogin} className="p-5 flex flex-col gap-4 text-center">
                <div className="w-10 h-10 rounded-full bg-natural-sidebar border border-natural-border flex items-center justify-center mx-auto">
                  <span className="text-base">🔒</span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-natural-title">관리자 인증이 필요합니다</h3>
                  <p className="text-[10px] text-natural-text/70 mt-0.5 leading-normal">
                    설정을 세팅하면 모든 접속자에게 전역 실시간 반영됩니다.
                  </p>
                  <p className={`text-[10px] mt-2 font-semibold ${serverHasApiKey ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {serverHasApiKey
                      ? `Gemini API 키: 등록됨${serverMaskedApiKey ? ` (${serverMaskedApiKey})` : ''}`
                      : 'Gemini API 키: 미등록 — .env.local의 GEMINI_API_KEY 또는 로그인 후 입력'}
                  </p>
                  <p className={`text-[10px] mt-1 font-semibold ${serverHasCursorApiKey ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {serverHasCursorApiKey
                      ? `Cursor Proxy 키: 등록됨${serverMaskedCursorApiKey ? ` (${serverMaskedCursorApiKey})` : ''}`
                      : 'Cursor Proxy 키: 미등록 — .env.local의 CURSOR_PROXY_API_KEY 또는 로그인 후 입력'}
                  </p>
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-semibold text-natural-text/60">비밀번호 입력</label>
                  <input
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="관리자 암호 입력 (기본값: admin)"
                    className="w-full bg-natural-bg border border-natural-border rounded-xl px-3 py-2 text-xs text-natural-title focus:outline-none focus:ring-1 focus:ring-natural-accent"
                    required
                    autoFocus
                  />
                  {adminError && <p className="text-[10px] text-rose-500 font-semibold">{adminError}</p>}
                </div>
                <div className="flex gap-1.5 justify-end mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setAdminPasswordInput('');
                      setAdminError(null);
                    }}
                    className="px-3 py-1.5 border border-natural-border text-natural-text hover:bg-natural-hover text-xs font-semibold rounded-lg cursor-pointer transition-all"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-natural-accent hover:bg-natural-accent-hover text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm transition-all"
                  >
                    확인 및 진입
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-4">
                {/* Active provider for chat */}
                <div className="bg-natural-bg border border-natural-border p-3 rounded-xl flex flex-col gap-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-natural-text/50">채팅에 사용할 LLM</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModelSettings((prev) => ({ ...prev, activeProvider: 'gemini' }));
                        setSettingsTab('gemini');
                      }}
                      className={`px-3 py-2 rounded-lg border text-left text-[10px] font-semibold transition-all cursor-pointer ${
                        modelSettings.activeProvider === 'gemini'
                          ? 'border-natural-accent ring-1 ring-natural-accent bg-natural-accent/5 text-natural-title'
                          : 'border-natural-border hover:border-natural-text/40 text-natural-text'
                      }`}
                    >
                      Google Gemini
                      <span className="block text-[9px] font-normal text-natural-text/60 mt-0.5">Gemma 4 등</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModelSettings((prev) => ({ ...prev, activeProvider: 'cursor-proxy' }));
                        setSettingsTab('cursor-proxy');
                      }}
                      className={`px-3 py-2 rounded-lg border text-left text-[10px] font-semibold transition-all cursor-pointer ${
                        modelSettings.activeProvider === 'cursor-proxy'
                          ? 'border-natural-accent ring-1 ring-natural-accent bg-natural-accent/5 text-natural-title'
                          : 'border-natural-border hover:border-natural-text/40 text-natural-text'
                      }`}
                    >
                      Cursor Proxy
                      <span className="block text-[9px] font-normal text-natural-text/60 mt-0.5">Composer 2.5</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModelSettings((prev) => ({ ...prev, activeProvider: 'cline-pass' }));
                        setSettingsTab('cline-pass');
                      }}
                      className={`px-3 py-2 rounded-lg border text-left text-[10px] font-semibold transition-all cursor-pointer ${
                        modelSettings.activeProvider === 'cline-pass'
                          ? 'border-natural-accent ring-1 ring-natural-accent bg-natural-accent/5 text-natural-title'
                          : 'border-natural-border hover:border-natural-text/40 text-natural-text'
                      }`}
                    >
                      Cline Pass
                      <span className="block text-[9px] font-normal text-natural-text/60 mt-0.5">Qwen3.7 Plus (OAuth)</span>
                    </button>
                  </div>
                </div>

                {/* Provider tabs */}
                <div className="flex gap-1 p-1 bg-natural-bg border border-natural-border rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSettingsTab('gemini')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      settingsTab === 'gemini'
                        ? 'bg-natural-card text-natural-title shadow-sm'
                        : 'text-natural-text/60 hover:text-natural-title'
                    }`}
                  >
                    Google Gemini
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsTab('cursor-proxy')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      settingsTab === 'cursor-proxy'
                        ? 'bg-natural-card text-natural-title shadow-sm'
                        : 'text-natural-text/60 hover:text-natural-title'
                    }`}
                  >
                    Cursor Proxy
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsTab('cline-pass')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      settingsTab === 'cline-pass'
                        ? 'bg-natural-card text-natural-title shadow-sm'
                        : 'text-natural-text/60 hover:text-natural-title'
                    }`}
                  >
                    Cline Pass
                  </button>
                </div>

                {settingsTab === 'gemini' ? (
                  <>
                {/* ===== Gemini 패널 ===== */}
                {/* API Key Form */}
                <div className="bg-natural-bg border border-natural-border p-3.5 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔑</span>
                    <h3 className="text-xs font-bold text-natural-title">구글 Gemini API 키 전역 설정</h3>
                  </div>
                  <p className="text-[9.5px] text-natural-text/70 leading-normal">
                    모든 접속자들이 공통 사용할 구글 API Key입니다. 입력 시 실시간 저장됩니다.
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      value={adminApiKey}
                      onChange={(e) => setAdminApiKey(e.target.value)}
                      placeholder={serverMaskedApiKey ? `등록 완료 (마스킹): ${serverMaskedApiKey}` : "AI Studio / Cloud API Key 입력"}
                      className="flex-1 bg-natural-card border border-natural-border rounded-xl px-3 py-1.5 text-xs text-natural-title placeholder-natural-text/40 focus:outline-none focus:ring-1 focus:ring-natural-accent"
                    />
                    {adminApiKey !== serverMaskedApiKey && adminApiKey !== "" && (
                      <button
                        type="button"
                        onClick={() => setAdminApiKey(serverMaskedApiKey)}
                        className="px-2 py-1 bg-natural-border hover:bg-natural-hover text-natural-text text-[9.5px] font-semibold rounded-lg cursor-pointer"
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>

                {/* Routing Toggle Box */}
                <div className="bg-natural-bg border border-natural-border p-3.5 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <h3 className="text-xs font-bold text-natural-title truncate">자동 대체 라우팅 활성화</h3>
                    </div>
                    <p className="text-[9.5px] text-natural-text/70 mt-0.5 leading-normal">
                      한도 초과 시 끊김 없는 대화를 위해 하위 구글 기획 모델로 자동 백업 라우팅합니다.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={modelSettings.routingEnabled}
                      onChange={(e) => setModelSettings(prev => ({ ...prev, routingEnabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-natural-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-natural-accent"></div>
                  </label>
                </div>

                {/* Models List */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[9.5px] font-bold uppercase tracking-wider text-natural-text/50 font-mono">Gemma 4 모델 (API 연동)</h3>
                    <button
                      type="button"
                      onClick={loadModelsFromApi}
                      disabled={isLoadingModels}
                      className="text-[9.5px] font-semibold text-natural-accent hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                      새로고침
                    </button>
                  </div>

                  {isLoadingModels && (
                    <p className="text-[10px] text-natural-text/60 text-center py-4">Gemini API에서 모델 목록을 불러오는 중...</p>
                  )}

                  {modelsLoadError && (
                    <p className="text-[10px] text-rose-500 text-center py-2">{modelsLoadError}</p>
                  )}

                  {!isLoadingModels && modelSettings.models.length === 0 && !modelsLoadError && (
                    <p className="text-[10px] text-natural-text/60 text-center py-4">
                      모델 목록을 불러오지 못했습니다. 위 새로고침을 눌러 보세요.
                    </p>
                  )}

                  {modelSettings.models.map((model) => {
                    const isSelected = modelSettings.selectedModelId === model.id;
                    
                    return (
                      <div
                        key={model.id}
                        onClick={() => setModelSettings(prev => ({ ...prev, selectedModelId: model.id }))}
                        className={`border p-3 rounded-xl transition-all cursor-pointer flex flex-col gap-1.5 bg-natural-bg/30 ${
                          isSelected 
                            ? 'border-natural-accent ring-1 ring-natural-accent bg-natural-accent/5' 
                            : 'border-natural-border hover:border-natural-text/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="radio"
                              name="selectedModel"
                              checked={isSelected}
                              onChange={() => {}}
                              className="text-natural-accent focus:ring-natural-accent shrink-0"
                            />
                            <span className="text-[11px] font-bold text-natural-title truncate">{model.name}</span>
                          </div>
                          <span className="text-[9px] text-natural-text/60 font-mono font-semibold shrink-0">
                            이번 세션 {model.used || 0}회
                          </span>
                        </div>

                        <p className="text-[9px] text-natural-text/50 font-mono truncate">API: {MODEL_API_MAP[model.id] || model.id}</p>

                        {model.description && (
                          <p className="text-[10px] text-natural-text/75 leading-normal line-clamp-2">
                            {model.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-mono text-natural-text/60 bg-natural-sidebar/40 px-2.5 py-1 rounded-lg border border-natural-border/30">
                          <span>📥 <b>입력:</b> {(model.inputTokenLimit || 0).toLocaleString()} tokens</span>
                          <span>📤 <b>출력:</b> {(model.outputTokenLimit || 0).toLocaleString()} tokens</span>
                          {model.version && <span>🏷️ <b>버전:</b> {model.version}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                  </>
                ) : settingsTab === 'cursor-proxy' ? (
                  <>
                {/* ===== Cursor Proxy 패널 ===== */}
                <div className="bg-natural-bg border border-natural-border p-3.5 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <Plug className="w-3.5 h-3.5 text-violet-600" />
                    <h3 className="text-xs font-bold text-natural-title">Cursor Proxy API 연동</h3>
                  </div>
                  <p className="text-[9.5px] text-natural-text/70 leading-normal">
                    OpenAI 호환 Cursor Proxy 서버입니다. Composer 2.5만 사용하며 Fast 변형은 차단됩니다.
                  </p>
                  <label className="text-[10px] font-semibold text-natural-text/60">Base URL</label>
                  <input
                    type="text"
                    value={modelSettings.cursorProxy.baseUrl}
                    onChange={(e) =>
                      setModelSettings((prev) => ({
                        ...prev,
                        cursorProxy: { ...prev.cursorProxy, baseUrl: e.target.value },
                      }))
                    }
                    placeholder="http://168.107.36.218:8765/v1"
                    className="w-full bg-natural-card border border-natural-border rounded-xl px-3 py-1.5 text-xs text-natural-title font-mono focus:outline-none focus:ring-1 focus:ring-natural-accent"
                  />
                  <label className="text-[10px] font-semibold text-natural-text/60 mt-1">API Key (Bearer)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      value={cursorProxyApiKey}
                      onChange={(e) => setCursorProxyApiKey(e.target.value)}
                      placeholder={
                        serverMaskedCursorApiKey
                          ? `등록 완료: ${serverMaskedCursorApiKey}`
                          : 'Cursor Proxy Bearer 키 입력'
                      }
                      className="flex-1 bg-natural-card border border-natural-border rounded-xl px-3 py-1.5 text-xs text-natural-title focus:outline-none focus:ring-1 focus:ring-natural-accent"
                    />
                    {cursorProxyApiKey !== serverMaskedCursorApiKey && cursorProxyApiKey !== '' && (
                      <button
                        type="button"
                        onClick={() => setCursorProxyApiKey(serverMaskedCursorApiKey)}
                        className="px-2 py-1 bg-natural-border hover:bg-natural-hover text-natural-text text-[9.5px] font-semibold rounded-lg cursor-pointer"
                      >
                        취소
                      </button>
                    )}
                  </div>
                  {cursorProxyHealth && (
                    <p className={`text-[9.5px] font-semibold ${cursorProxyHealth === '연결됨' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      서버 상태: {cursorProxyHealth}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[9.5px] font-bold uppercase tracking-wider text-natural-text/50 font-mono">
                      Cursor 모델 (Composer 2.5)
                    </h3>
                    <button
                      type="button"
                      onClick={loadCursorModelsFromApi}
                      disabled={isLoadingCursorModels}
                      className="text-[9.5px] font-semibold text-natural-accent hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingCursorModels ? 'animate-spin' : ''}`} />
                      새로고침
                    </button>
                  </div>

                  {isLoadingCursorModels && (
                    <p className="text-[10px] text-natural-text/60 text-center py-4">Cursor Proxy에서 모델 목록을 불러오는 중...</p>
                  )}

                  {cursorModelsLoadError && (
                    <p className="text-[10px] text-rose-500 text-center py-2">{cursorModelsLoadError}</p>
                  )}

                  {!isLoadingCursorModels && modelSettings.cursorProxy.models.length === 0 && !cursorModelsLoadError && (
                    <p className="text-[10px] text-natural-text/60 text-center py-4">
                      API 키 저장 후 새로고침을 눌러 모델 목록을 불러오세요.
                    </p>
                  )}

                  {modelSettings.cursorProxy.models.map((model) => {
                    const isSelected = modelSettings.cursorProxy.selectedModelId === model.id;
                    const isComposer = model.id === 'composer-2.5';

                    return (
                      <div
                        key={model.id}
                        onClick={() =>
                          setModelSettings((prev) => ({
                            ...prev,
                            cursorProxy: { ...prev.cursorProxy, selectedModelId: model.id },
                          }))
                        }
                        className={`border p-3 rounded-xl transition-all cursor-pointer flex flex-col gap-1.5 bg-natural-bg/30 ${
                          isSelected
                            ? 'border-natural-accent ring-1 ring-natural-accent bg-natural-accent/5'
                            : 'border-natural-border hover:border-natural-text/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="radio"
                              name="cursorSelectedModel"
                              checked={isSelected}
                              onChange={() => {}}
                              className="text-natural-accent focus:ring-natural-accent shrink-0"
                            />
                            <span className="text-[11px] font-bold text-natural-title truncate">
                              {isComposer ? 'Composer 2.5 (권장)' : model.name}
                            </span>
                          </div>
                          <span className="text-[9px] text-natural-text/60 font-mono font-semibold shrink-0">
                            이번 세션 {model.used || 0}회
                          </span>
                        </div>
                        <p className="text-[9px] text-natural-text/50 font-mono truncate">API: {model.id}</p>
                        {model.description && (
                          <p className="text-[10px] text-natural-text/75 leading-normal line-clamp-2">{model.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-mono text-natural-text/60 bg-natural-sidebar/40 px-2.5 py-1 rounded-lg border border-natural-border/30">
                          <span>📥 <b>컨텍스트:</b> {(model.inputTokenLimit || 0).toLocaleString()} tokens</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                  </>
                ) : (
                  <>
                {/* ===== Cline Pass 패널 ===== */}
                <div className="bg-natural-bg border border-natural-border p-3.5 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔐</span>
                    <h3 className="text-xs font-bold text-natural-title">Cline Pass 토큰 인증</h3>
                  </div>
                  <p className="text-[9.5px] text-natural-text/70 leading-normal">
                    Cline(cline.bot) 구독 모델(Qwen3.7 Plus 등)을 사용합니다. Cline 계정 토큰을 아래에 붙여넣으면 바로 사용할 수 있습니다.
                  </p>
                  <label className="text-[10px] font-semibold text-natural-text/60">Base URL</label>
                  <input
                    type="text"
                    value={modelSettings.clinePass.baseUrl}
                    onChange={(e) =>
                      setModelSettings((prev) => ({
                        ...prev,
                        clinePass: { ...prev.clinePass, baseUrl: e.target.value },
                      }))
                    }
                    placeholder="https://api.cline.bot"
                    className="w-full bg-natural-card border border-natural-border rounded-xl px-3 py-1.5 text-xs text-natural-title font-mono focus:outline-none focus:ring-1 focus:ring-natural-accent"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] font-semibold ${modelSettings.clinePass.isAuthenticated ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {modelSettings.clinePass.isAuthenticated ? '✅ 인증됨' : '⚠️ 토큰 필요'}
                    </span>
                    {modelSettings.clinePass.isAuthenticated && modelSettings.clinePass.tokenExpiresAt > 0 && (
                      <span className="text-[9px] text-natural-text/50 font-mono">
                        만료: {new Date(modelSettings.clinePass.tokenExpiresAt).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>

                  {/* 토큰 입력 */}
                  <div className="mt-2">
                    <label className="text-[10px] font-semibold text-natural-text/60 block mb-1">
                      Cline 계정 토큰 붙여넣기
                    </label>
                    <input
                      type="text"
                      placeholder="refreshToken 또는 idToken을 붙여넣고 Enter"
                      className="w-full bg-natural-card border border-natural-border rounded-xl px-3 py-1.5 text-[10px] text-natural-title font-mono focus:outline-none focus:ring-1 focus:ring-natural-accent"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const token = (e.target as HTMLInputElement).value.trim();
                          if (!token) return;
                          try {
                            const res = await fetch('/api/cline-pass/auth/callback', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ refreshToken: token }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setModelSettings((prev) => ({
                                ...prev,
                                clinePass: {
                                  ...prev.clinePass,
                                  isAuthenticated: true,
                                  tokenExpiresAt: data.tokenExpiresAt || 0,
                                },
                              }));
                              (e.target as HTMLInputElement).value = '';
                              alert('Cline Pass 인증이 완료되었습니다.');
                            } else {
                              const err = await res.json().catch(() => ({}));
                              alert(err.error || '토큰 저장 실패');
                            }
                          } catch (err) {
                            alert('토큰 전송 실패');
                          }
                        }
                      }}
                    />
                    <p className="text-[9px] text-natural-text/50 mt-1">Enter를 눌러 저장</p>
                  </div>

                  {/* 토큰 얻는 방법 안내 */}
                  <div className="mt-2 bg-amber-50/50 border border-amber-200/60 rounded-lg p-2.5">
                    <p className="text-[9px] font-semibold text-amber-700 mb-1">💡 토큰은 어디서 얻나요?</p>
                    <ol className="text-[9px] text-natural-text/70 leading-relaxed list-decimal list-inside space-y-0.5">
                      <li>VS Code 또는 Cursor에 Cline 확장을 설치하고 로그인</li>
                      <li>VS Code: <b>Ctrl+Shift+P</b> → "Cline: Open Settings" → 개발자 도구(F12) → Console에서 <code>clineAccountId</code> 또는 토큰 값 확인</li>
                      <li>또는 Cursor/Cline 확장 설정 파일에서 인증 토큰 복사</li>
                      <li>위 입력란에 붙여넣고 Enter</li>
                    </ol>
                    <p className="text-[9px] text-natural-text/50 mt-1.5">
                      Cline OAuth는 IDE 확장 전용으로 설계되어 있어 웹브라우저에서 직접 로그인이 불가능합니다.
                    </p>
                  </div>

                  {modelSettings.clinePass.isAuthenticated && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await fetch('/api/cline-pass/auth/logout', { method: 'POST' });
                          setModelSettings((prev) => ({
                            ...prev,
                            clinePass: { ...prev.clinePass, isAuthenticated: false, tokenExpiresAt: 0 },
                          }));
                        } catch (err) {
                          alert('로그아웃 실패');
                        }
                      }}
                      className="mt-2 px-3 py-1.5 border border-natural-border hover:bg-natural-hover text-natural-text text-[10px] font-semibold rounded-lg cursor-pointer"
                    >
                      로그아웃 (토큰 삭제)
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <h3 className="text-[9.5px] font-bold uppercase tracking-wider text-natural-text/50 font-mono">
                    Cline Pass 모델 (GLM-5.2)
                  </h3>
                  {modelSettings.clinePass.models.length === 0 && (
                    <p className="text-[10px] text-natural-text/60 text-center py-4">
                      인증 완료 후 사용 가능한 모델이 표시됩니다.
                    </p>
                  )}
                  {modelSettings.clinePass.models.map((model) => {
                    const isSelected = modelSettings.clinePass.selectedModelId === model.id;
                    return (
                      <div
                        key={model.id}
                        onClick={() =>
                          setModelSettings((prev) => ({
                            ...prev,
                            clinePass: { ...prev.clinePass, selectedModelId: model.id },
                          }))
                        }
                        className={`border p-3 rounded-xl transition-all cursor-pointer flex flex-col gap-1.5 bg-natural-bg/30 ${
                          isSelected
                            ? 'border-natural-accent ring-1 ring-natural-accent bg-natural-accent/5'
                            : 'border-natural-border hover:border-natural-text/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="radio"
                              name="clinePassSelectedModel"
                              checked={isSelected}
                              onChange={() => {}}
                              className="text-natural-accent focus:ring-natural-accent shrink-0"
                            />
                            <span className="text-[11px] font-bold text-natural-title truncate">{model.name}</span>
                          </div>
                          <span className="text-[9px] text-natural-text/60 font-mono font-semibold shrink-0">
                            이번 세션 {model.used || 0}회
                          </span>
                        </div>
                        <p className="text-[9px] text-natural-text/50 font-mono truncate">API: {model.id}</p>
                        {model.description && (
                          <p className="text-[10px] text-natural-text/75 leading-normal line-clamp-2">{model.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-mono text-natural-text/60 bg-natural-sidebar/40 px-2.5 py-1 rounded-lg border border-natural-border/30">
                          <span>📥 <b>컨텍스트:</b> {(model.inputTokenLimit || 0).toLocaleString()} tokens</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                  </>
                )}
              </div>
            )}

            {/* Modal Footer */}
            {isAdminAuthenticated && (
              <div className="px-4 py-3 border-t border-natural-border bg-natural-bg/50 flex items-center justify-between shrink-0">
                <button
                  onClick={() => {
                    setModelSettings(prev => ({
                      ...prev,
                      models: prev.models.map(m => ({ ...m, used: 0 })),
                      cursorProxy: {
                        ...prev.cursorProxy,
                        models: prev.cursorProxy.models.map(m => ({ ...m, used: 0 })),
                      },
                    }));
                  }}
                  className="text-[9.5px] font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  세션 사용 횟수 초기화
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsAdminAuthenticated(false);
                      setAdminPasswordInput('');
                    }}
                    className="px-3 py-1.5 border border-natural-border hover:bg-natural-hover text-natural-text text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings}
                    className="px-4 py-1.5 bg-natural-accent hover:bg-natural-accent-hover text-white text-xs font-bold rounded-lg cursor-pointer shadow-sm transition-all disabled:opacity-50"
                  >
                    {isSavingSettings ? "저장 중..." : "전역 설정 저장"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

