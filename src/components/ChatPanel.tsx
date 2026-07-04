import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Send, Sparkles, AlertCircle, RefreshCw, CheckSquare, Mic, MicOff, Brain } from 'lucide-react';

function formatResponseText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\/n/g, '\n');
}

function ThinkingProgress({ 
  progress 
}: { 
  progress?: {
    reasoning: string;
    reply: string;
    updatedContent: string;
    critique: string;
    currentActiveField: 'reasoning' | 'reply' | 'updatedContent' | 'critique' | 'none';
  } 
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsed((Date.now() - startTime) / 1000);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  if (!progress) {
    return (
      <div className="flex justify-start w-full animate-fadeIn" id="chat-thinking-block">
        <div className="bg-natural-card border border-natural-border/60 text-natural-text/90 rounded-2xl rounded-bl-none p-3.5 max-w-[85%] shadow-md flex flex-col gap-2.5 w-full">
          <div className="flex items-center justify-between gap-4 border-b border-natural-border/30 pb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-natural-accent" />
              <span className="font-bold text-xs text-natural-title font-sans">에이전트가 생각하고 있습니다...</span>
            </div>
            <span className="text-[10px] text-natural-accent font-mono font-bold bg-natural-accent/10 px-2 py-0.5 rounded-full">
              ⏱️ {elapsed.toFixed(1)}초 경과
            </span>
          </div>
          <div className="text-[10.5px] text-natural-text/85 font-sans leading-relaxed bg-natural-bg/40 p-2.5 rounded-lg border border-natural-border/20 max-h-[160px] overflow-y-auto scrollbar-thin whitespace-pre-line text-left">
            추론을 준비하고 있습니다...
          </div>
        </div>
      </div>
    );
  }

  const { reasoning, reply, updatedContent, critique, currentActiveField } = progress;

  // Determine completion of steps
  const isReasoningDone = !!reply || currentActiveField === 'reply' || currentActiveField === 'updatedContent' || currentActiveField === 'critique';
  const isReplyDone = !!updatedContent || !!critique || currentActiveField === 'updatedContent' || currentActiveField === 'critique';
  const isContentDone = !!critique || currentActiveField === 'critique';
  
  // Check if we even have these fields in generation
  const hasContent = updatedContent.length > 0 || currentActiveField === 'updatedContent';
  const hasCritique = critique.length > 0 || currentActiveField === 'critique';

  return (
    <div className="flex justify-start w-full animate-fadeIn" id="chat-thinking-block">
      <div className="bg-natural-card border border-natural-border/60 text-natural-text/90 rounded-2xl rounded-bl-none p-4 max-w-[95%] sm:max-w-[85%] shadow-lg flex flex-col gap-3.5 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-natural-border/30 pb-2.5">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-natural-accent" />
            <span className="font-bold text-xs text-natural-title font-sans">에이전트가 생각하고 있습니다...</span>
          </div>
          <span className="text-[10px] text-natural-accent font-mono font-bold bg-natural-accent/10 px-2.5 py-0.5 rounded-full">
            ⏱️ {elapsed.toFixed(1)}초 경과
          </span>
        </div>

        {/* Step-by-Step Generation Flow */}
        <div className="space-y-3.5 text-left">
          
          {/* Step 1: Brainstorming & Reasoning */}
          <div className="flex gap-2.5 text-xs">
            <div className="flex flex-col items-center shrink-0 mt-0.5">
              <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                isReasoningDone 
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' 
                  : 'bg-natural-accent/15 text-natural-accent border border-natural-accent/30 animate-pulse'
              }`}>
                {isReasoningDone ? '✓' : '1'}
              </span>
              <div className="w-0.5 h-full bg-natural-border/30 min-h-[12px] mt-1" />
            </div>
            <div className="flex flex-col gap-1 w-full">
              <span className={`font-semibold text-xs ${isReasoningDone ? 'text-natural-text/50' : 'text-natural-title'}`}>
                기획 방향성 분석 및 실시간 추론 (AI Reasoning)
              </span>
              
              {/* Show the reasoning box */}
              {reasoning && (
                <div className="text-[10.5px] text-natural-text/85 font-sans leading-relaxed bg-natural-bg/40 p-2.5 rounded-lg border border-natural-border/20 max-h-[120px] overflow-y-auto scrollbar-thin whitespace-pre-line text-left mt-1">
                  {reasoning}
                </div>
              )}
              {!reasoning && (
                <span className="text-[10.5px] text-natural-text/45 leading-relaxed">
                  사용자 의도를 심층 분석하여 기획 맥락을 정리하는 중...
                </span>
              )}
            </div>
          </div>

          {/* Step 2: Generating Response Message */}
          <div className="flex gap-2.5 text-xs">
            <div className="flex flex-col items-center shrink-0 mt-0.5">
              <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                isReplyDone 
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' 
                  : (currentActiveField === 'reply' 
                      ? 'bg-natural-accent/15 text-natural-accent border border-natural-accent/30 animate-pulse' 
                      : 'bg-natural-bg border border-natural-border/40 text-natural-text/30')
              }`}>
                {isReplyDone ? '✓' : '2'}
              </span>
              {(hasContent || hasCritique) && <div className="w-0.5 h-full bg-natural-border/30 min-h-[12px] mt-1" />}
            </div>
            <div className="flex flex-col gap-0.5 w-full">
              <span className={`font-semibold text-xs ${
                isReplyDone 
                  ? 'text-natural-text/50' 
                  : (currentActiveField === 'reply' ? 'text-natural-title' : 'text-natural-text/30')
              }`}>
                대화 답변 및 피드백 메시지 작성
              </span>
              {currentActiveField === 'reply' && (
                <span className="text-[10px] text-natural-accent font-semibold animate-pulse">
                  ✍️ 답변 메시지 생성 중... ({reply.length}자 돌파)
                </span>
              )}
              {isReplyDone && (
                <span className="text-[10px] text-emerald-600/80 font-medium">
                  ✓ 완료 ({reply.length}자 생성됨)
                </span>
              )}
            </div>
          </div>

          {/* Step 3: Content Drafting (If active or present) */}
          {hasContent && (
            <div className="flex gap-2.5 text-xs">
              <div className="flex flex-col items-center shrink-0 mt-0.5">
                <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  isContentDone 
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' 
                    : (currentActiveField === 'updatedContent' 
                        ? 'bg-natural-accent/15 text-natural-accent border border-natural-accent/30 animate-pulse' 
                        : 'bg-natural-bg border border-natural-border/40 text-natural-text/30')
                }`}>
                  {isContentDone ? '✓' : '3'}
                </span>
                {hasCritique && <div className="w-0.5 h-full bg-natural-border/30 min-h-[12px] mt-1" />}
              </div>
              <div className="flex flex-col gap-0.5 w-full">
                <span className={`font-semibold text-xs ${
                  isContentDone 
                    ? 'text-natural-text/50' 
                    : (currentActiveField === 'updatedContent' ? 'text-natural-title' : 'text-natural-text/30')
                }`}>
                  기획서 상세 본문 집필 (SOP Drafting)
                </span>
                {currentActiveField === 'updatedContent' && (
                  <span className="text-[10px] text-natural-accent font-semibold animate-pulse">
                    📝 상세 섹션 내용 집필 중... ({updatedContent.length}자 작성됨)
                  </span>
                )}
                {isContentDone && (
                  <span className="text-[10px] text-emerald-600/80 font-medium">
                    ✓ 본문 완성 ({updatedContent.length}자 집필 완료)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 4: McKinsey Critique (If active or present) */}
          {hasCritique && (
            <div className="flex gap-2.5 text-xs">
              <div className="flex flex-col items-center shrink-0 mt-0.5">
                <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                  currentActiveField === 'none' 
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' 
                    : (currentActiveField === 'critique' 
                        ? 'bg-natural-accent/15 text-natural-accent border border-natural-accent/30 animate-pulse' 
                        : 'bg-natural-bg border border-natural-border/40 text-natural-text/30')
                }`}>
                  {currentActiveField === 'none' ? '✓' : '4'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 w-full">
                <span className={`font-semibold text-xs ${
                  currentActiveField === 'none' 
                    ? 'text-natural-text/50' 
                    : (currentActiveField === 'critique' ? 'text-natural-title' : 'text-natural-text/30')
                }`}>
                  맥킨지 관점 입체적 논리 비평 (Critique)
                </span>
                {currentActiveField === 'critique' && (
                  <span className="text-[10px] text-natural-accent font-semibold animate-pulse">
                    🔍 맹점 분석 및 냉철한 비평 생성 중... ({critique.length}자 작성됨)
                  </span>
                )}
                {currentActiveField === 'none' && (
                  <span className="text-[10px] text-emerald-600/80 font-medium">
                    ✓ 비평 검토 완료 ({critique.length}자 생성됨)
                  </span>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

interface ChatPanelProps {
  history: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  status: 'interviewing' | 'writing' | 'reviewing' | 'completed';
  currentSectionTitle: string | null;
  onConfirmSection: () => void;
  onDownloadWiki?: () => void;
  realTimeProgress?: {
    reasoning: string;
    reply: string;
    updatedContent: string;
    critique: string;
    currentActiveField: 'reasoning' | 'reply' | 'updatedContent' | 'critique' | 'none';
  };
}

export default function ChatPanel({
  history,
  onSendMessage,
  isLoading,
  status,
  currentSectionTitle,
  onConfirmSection,
  onDownloadWiki,
  realTimeProgress,
}: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const inputTextRef = useRef(inputText);
  const baseTextRef = useRef('');
  const shouldBeListeningRef = useRef(false);
  const lastRecognizedRef = useRef('');

  // Find the latest message that contains context tokens and model used info
  const latestModelMsg = [...history].reverse().find(msg => msg.contextTokens !== undefined);
  const latestContextTokens = latestModelMsg?.contextTokens || 0;
  const latestContextLimit = latestModelMsg?.contextLimit || 1000000;
  const latestModelId = latestModelMsg?.modelUsed || '';
  
  // Pretty name for the model
  const getModelName = (id: string) => {
    if (!id) return "자동 대기 중...";
    if (id === 'gemma-4-31b') return "Gemma 4 31B";
    if (id === 'gemma-4-26b') return "Gemma 4 26B";
    if (id === 'gemini-3.1-flash-lite') return "Gemini 3.1 Flash Lite";
    return id;
  };

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const initSpeechRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'ko-KR';

      rec.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
        baseTextRef.current = inputTextRef.current;
        lastRecognizedRef.current = '';
      };

      rec.onresult = (event: any) => {
        let sessionText = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i][0]) {
            sessionText += event.results[i][0].transcript;
          }
        }
        
        const base = baseTextRef.current.trim();
        const recognized = sessionText.trim();
        lastRecognizedRef.current = recognized;
        if (recognized) {
          setInputText(base ? `${base} ${recognized}` : recognized);
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'no-speech') {
          // In continuous mode, silence is not a critical error. Do not abort.
          return;
        }
        
        let userFriendlyMessage = "";
        switch (event.error) {
          case 'not-allowed':
            userFriendlyMessage = "마이크 권한이 거부되었습니다. 브라우저 주소창 설정에서 마이크를 허용해 주세요.";
            shouldBeListeningRef.current = false;
            setIsListening(false);
            break;
          case 'audio-capture':
            userFriendlyMessage = "연결된 마이크를 찾을 수 없습니다.";
            shouldBeListeningRef.current = false;
            setIsListening(false);
            break;
          default:
            // Other transient errors we can ignore or show gently
            break;
        }
        if (userFriendlyMessage) {
          setVoiceError(userFriendlyMessage);
        }
      };

      rec.onend = () => {
        if (shouldBeListeningRef.current) {
          try {
            // Keep listening continuously! Auto-restart if browser stops due to silence
            rec.start();
          } catch (err) {
            console.error("Auto-restart failed:", err);
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = rec;
      return rec;
    } catch (err) {
      console.error("Failed to initialize speech recognition:", err);
      return null;
    }
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저 환경은 웹 음성 인식 API(SpeechRecognition)를 지원하지 않습니다. Chrome, Safari 등의 최신 브라우저를 사용해 주세요.");
      return;
    }

    const rec = initSpeechRecognition();
    if (!rec) {
      alert("음성 인식 서비스를 초기화하지 못했습니다.");
      return;
    }

    setVoiceError(null);

    if (isListening) {
      // Manual stop
      shouldBeListeningRef.current = false;
      try {
        rec.stop();
      } catch (err) {
        console.error("Stop failed", err);
      }
      setIsListening(false);
    } else {
      // Manual start
      shouldBeListeningRef.current = true;
      baseTextRef.current = inputText; // capture current text as base
      lastRecognizedRef.current = '';
      try {
        rec.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        // If already active or some transient state, stop first and restart
        try {
          rec.stop();
          setTimeout(() => {
            if (shouldBeListeningRef.current) {
              rec.start();
            }
          }, 300);
        } catch (e) {}
      }
    }
  };

  const restartRecognitionBuffer = () => {
    if (recognitionRef.current && isListening) {
      shouldBeListeningRef.current = true;
      lastRecognizedRef.current = '';
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
  };

  const handleInputChange = (val: string) => {
    setInputText(val);
    if (isListening) {
      const recognized = lastRecognizedRef.current;
      if (recognized) {
        const idx = val.lastIndexOf(recognized);
        if (idx !== -1) {
          const prefix = val.slice(0, idx);
          const suffix = val.slice(idx + recognized.length);
          baseTextRef.current = prefix + suffix;
        } else {
          baseTextRef.current = val;
          restartRecognitionBuffer();
        }
      } else {
        baseTextRef.current = val;
      }
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText);
    setInputText('');
    baseTextRef.current = '';
    lastRecognizedRef.current = '';
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, isLoading]);

  // Shortcut suggestions based on state
  const getSuggestions = () => {
    if (status === 'interviewing') {
      return [
        "이 생각들을 바탕으로 목차 추천해줘",
        "타겟 유저는 누구로 잡는 게 좋을까?",
        "기존 유사 서비스와의 주요 차별점은?",
        "이걸로 기획안 목차 정해보자!"
      ];
    } else if (status === 'writing' || status === 'reviewing') {
      return [
        "맥킨지 관점에서 이 내용 비평해줘",
        "내용을 더 날카롭게 수정해줘",
        "여기에 시장 분석 내용을 보완해줘",
        "이 섹션 완성됐으니 확정 및 저장해줘"
      ];
    }
    return [
      "기획서 전체 다운로드하고 싶어",
      "이어서 다른 섹션 집필할래",
      "목차를 다시 재구성해줘"
    ];
  };

  return (
    <div className="flex flex-col h-full bg-natural-card border border-natural-border rounded-2xl overflow-hidden shadow-sm" id="chat-panel">
      {/* Header */}
      <div className="px-4 py-3 bg-natural-sidebar/35 border-b border-natural-border flex items-center justify-between" id="chat-header">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-natural-accent animate-pulse" />
          <span className="font-bold text-xs text-natural-title">
            {status === 'interviewing' && '🧠 AI 공동 기획자 인터뷰'}
            {status === 'writing' && `✍️ '${currentSectionTitle}' 집필 중`}
            {status === 'reviewing' && `🧐 '${currentSectionTitle}' 비평 피드백`}
            {status === 'completed' && '✅ 빌드업 완료'}
          </span>
        </div>
        
        {currentSectionTitle && (status === 'writing' || status === 'reviewing') && (
          <button
            id="btn-confirm-section-shortcut"
            onClick={onConfirmSection}
            className="px-2.5 py-1 text-[11px] font-semibold bg-natural-accent hover:bg-natural-accent-hover text-white rounded transition flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            이 섹션 확정/저장
          </button>
        )}
      </div>

      {/* Model & Cumulative Context Status Bar */}
      {history.length > 0 && (
        <div className="px-4 py-2 bg-natural-sidebar/15 border-b border-natural-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[10px] text-natural-text/85">
          <div className="flex items-center gap-1.5 font-sans font-medium">
            <span className="text-natural-accent">🤖 현재 호출 모델:</span>
            <span className="bg-natural-accent/10 border border-natural-accent/20 px-2 py-0.5 rounded font-bold text-[9.5px] text-natural-accent">
              {getModelName(latestModelId)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 sm:justify-end max-w-sm">
            <span className="font-semibold text-natural-accent shrink-0">📊 이 프로젝트 대화 누적 사용량:</span>
            <div className="w-20 sm:w-28 bg-natural-border/45 h-1.5 rounded-full overflow-hidden shrink-0">
              <div 
                className="bg-natural-accent h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (latestContextTokens / latestContextLimit) * 100)}%` }}
              />
            </div>
            <span className="font-mono font-bold text-[9px] text-natural-title shrink-0">
              {latestContextTokens.toLocaleString()} / {latestContextLimit.toLocaleString()} tokens ({((latestContextTokens / latestContextLimit) * 100).toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 md:p-3 space-y-2.5 bg-natural-bg/15" id="chat-messages">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4" id="chat-welcome-state">
            <div className="w-10 h-10 rounded-full bg-natural-sidebar border border-natural-border flex items-center justify-center mb-2">
              <Sparkles className="w-5 h-5 text-natural-accent" />
            </div>
            <h3 className="font-bold text-natural-title text-xs mb-0.5">인터뷰가 곧 시작됩니다</h3>
            <p className="text-[10px] text-natural-text/70 max-w-xs leading-relaxed">
              사용자가 던진 거친 아이디어를 바탕으로 날카로운 질문을 드릴게요. 편하게 생각을 더해 나가세요.
            </p>
          </div>
        ) : (
          history.map((msg) => {
            const isUser = msg.role === 'user';
            const isSystem = msg.type === 'system_alert';
            
            if (isSystem) {
              const isConfirm = msg.text.includes('[확정 및 저장]') || msg.text.includes('[확정]') || msg.actionType === 'download_wiki';
              return (
                <div key={msg.id} className="flex flex-col items-center justify-center my-1.5" id={`chat-msg-system-${msg.id}`}>
                  <div className="bg-natural-sidebar/65 border border-natural-border/40 rounded-xl px-3 py-1.5 text-[10px] text-natural-text/80 flex flex-col sm:flex-row items-center gap-2 max-w-md shadow-xs font-sans">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-natural-peach shrink-0" />
                      <span className="leading-relaxed">{msg.text}</span>
                    </div>
                    {isConfirm && onDownloadWiki && (
                      <button
                        onClick={onDownloadWiki}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[9.5px] flex items-center gap-1 transition-all cursor-pointer shadow-xs whitespace-nowrap shrink-0 ml-1.5"
                      >
                        📥 .md 다운로드
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                id={`chat-msg-item-${msg.id}`}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 md:py-2 text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-natural-accent text-white font-medium rounded-br-none'
                      : 'bg-natural-card border border-natural-border/55 text-natural-text rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-line">{formatResponseText(msg.text)}</p>
                  
                  {msg.reasoning && (
                    <div className="mt-1.5 pt-1.5 border-t border-natural-border/40 text-left">
                      <details className="group">
                        <summary className="flex items-center gap-1 text-[9px] text-natural-text/60 hover:text-natural-accent font-semibold cursor-pointer list-none select-none">
                          <Brain className="w-3 h-3 text-natural-accent shrink-0" />
                          <span>에이전트의 생각의 흐름 보기</span>
                          {msg.reasoningTime !== undefined && (
                            <span className="ml-1.5 font-mono text-[8px] bg-natural-sidebar px-1.5 py-0.5 rounded text-natural-text/75 font-semibold">
                              ⏱️ {msg.reasoningTime.toFixed(1)}초
                            </span>
                          )}
                          <span className="transition-transform group-open:rotate-180 text-[7px] ml-auto">▼</span>
                        </summary>
                        <div className="mt-1.5 p-2 rounded-lg bg-natural-bg/50 text-[10px] text-natural-text/80 font-sans border border-natural-border/30 whitespace-pre-line leading-relaxed">
                          {formatResponseText(msg.reasoning)}
                        </div>
                      </details>
                    </div>
                  )}

                  {msg.contextTokens !== undefined && msg.contextLimit !== undefined && (
                    <div className="mt-1.5 pt-1.5 border-t border-natural-border/30 text-left text-[9.5px] text-natural-text/70 flex flex-col gap-1 font-sans">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-natural-accent">📊 누적 대화 컨텍스트:</span>
                          <span className="font-mono text-[8.5px] text-natural-text/80">
                            {msg.contextTokens.toLocaleString()} / {msg.contextLimit.toLocaleString()} tokens
                          </span>
                        </div>
                        <span className="font-bold text-[8.5px] text-natural-accent bg-natural-accent/10 px-1.5 py-0.5 rounded shrink-0">
                          {((msg.contextTokens / msg.contextLimit) * 100).toFixed(2)}%
                        </span>
                      </div>
                      {msg.modelUsed && (
                        <div className="text-[8.5px] text-natural-text/50 flex items-center gap-1 font-medium">
                          <span>🤖 적용 모델:</span>
                          <span className="bg-natural-border/40 px-1.5 py-0.2 rounded text-[8px] font-semibold text-natural-text/70">
                            {getModelName(msg.modelUsed)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <span className={`block text-[8px] mt-1 text-right ${isUser ? 'text-white/80' : 'text-natural-text/50'} font-mono`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        
        {isLoading && (
          <ThinkingProgress progress={realTimeProgress} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-2 border-t border-natural-border bg-natural-sidebar/35" id="chat-input-form-wrapper">
        {isListening && (
          <div className="mb-1.5 px-2 py-1 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-[9px] font-semibold flex items-center gap-1.5 animate-pulse">
            <span className="w-1 h-1 rounded-full bg-rose-600 animate-ping" />
            <span>마이크 귀 기울이는 중... 말씀하시면 한글로 받아씁니다.</span>
          </div>
        )}
        {voiceError && (
          <div className="mb-1.5 px-2 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-amber-700 text-[9.5px] font-medium flex items-start gap-1.5 relative">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 pr-6">
              <span>{voiceError}</span>
            </div>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              className="absolute right-1.5 top-1.5 text-amber-500 hover:text-amber-800 text-[9px] font-bold cursor-pointer transition-all"
              title="알림 닫기"
            >
              ✕
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-1.5">
          <input
            id="chat-text-input"
            type="text"
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={isLoading}
            placeholder={
              status === 'interviewing' 
                ? "여기에 생각을 더 입력하거나 질문에 답해 보세요..." 
                : "비평을 보고 아이디어를 더 보충하거나 고쳐 보세요..."
            }
            className="flex-1 bg-natural-card border border-natural-border rounded-xl px-3 py-2 text-xs text-natural-title placeholder-natural-text/40 focus:outline-none focus:ring-1 focus:ring-natural-accent disabled:opacity-50"
          />
          <button
            id="chat-voice-input-btn"
            type="button"
            onClick={toggleListening}
            disabled={isLoading}
            className={`p-2 rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              isListening
                ? 'bg-rose-500 border-rose-600 text-white animate-pulse shadow-sm'
                : 'bg-natural-card border-natural-border hover:border-natural-accent/30 text-natural-text/70 hover:text-natural-title'
            }`}
            title={isListening ? "음성 인식 중 (클릭하여 멈춤)" : "음성으로 받아쓰기"}
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            id="chat-send-submit"
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="px-3 rounded-xl bg-natural-accent hover:bg-natural-accent-hover text-white font-semibold transition disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
