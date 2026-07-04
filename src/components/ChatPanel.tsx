import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Send, Sparkles, AlertCircle, RefreshCw, CheckSquare, Mic, MicOff, Brain, Clipboard, Check, Loader2 } from 'lucide-react';

import { buildModelChatText } from '../contentUtils';

function formatResponseText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\/n/g, '\n');
}

function getFullMessageCopyText(msg: ChatMessage): string {
  const parts = [formatResponseText(msg.text)];
  if (msg.reasoning) {
    parts.push('', '---', '[에이전트의 생각의 흐름]', formatResponseText(msg.reasoning));
  }
  return parts.join('\n').trim();
}

function StreamingModelMessage({
  progress,
}: {
  progress?: {
    reasoning: string;
    reply: string;
    updatedContent: string;
    critique: string;
    currentActiveField: 'reasoning' | 'reply' | 'updatedContent' | 'critique' | 'none';
    streamPhase?: 'connecting' | 'reasoning' | 'draft' | 'reply' | 'critique';
    streamLabel?: string;
  };
}) {
  const reasoning = progress?.reasoning || '';
  const reply = progress?.reply || '';
  const critique = progress?.critique || '';
  const updatedContent = progress?.updatedContent || '';
  const activeField = progress?.currentActiveField || 'none';
  const streamPhase = progress?.streamPhase || (reasoning ? 'reasoning' : 'connecting');
  const streamLabel = progress?.streamLabel;
  const chatText = buildModelChatText(reply, critique);
  const displayReply = formatResponseText(chatText);
  const isReplyStreaming = activeField === 'reply' || activeField === 'critique';
  const isReasoningStreaming = streamPhase === 'reasoning' || streamPhase === 'connecting';
  const isDraftStreaming = streamPhase === 'draft' || activeField === 'updatedContent';
  const draftPreview = formatResponseText(updatedContent).slice(0, 600);

  const steps: Array<{ id: string; label: string; active: boolean; done: boolean }> = [
    {
      id: 'connecting',
      label: '연결',
      active: streamPhase === 'connecting',
      done: streamPhase !== 'connecting',
    },
    {
      id: 'reasoning',
      label: '추론',
      active: streamPhase === 'reasoning',
      done: ['draft', 'reply', 'critique'].includes(streamPhase),
    },
    {
      id: 'draft',
      label: '초안',
      active: streamPhase === 'draft',
      done: ['reply', 'critique'].includes(streamPhase) && !!displayReply,
    },
    {
      id: 'reply',
      label: '답변',
      active: streamPhase === 'reply' || streamPhase === 'critique',
      done: false,
    },
  ];

  return (
    <div className="flex justify-start w-full animate-fadeIn" id="chat-streaming-message">
      <div className="max-w-[85%] rounded-2xl rounded-bl-none px-3 py-2 md:py-2.5 text-xs leading-relaxed shadow-sm bg-natural-card border border-natural-accent/25 text-natural-text">
        {streamLabel && (
          <p className="text-[9px] font-semibold text-natural-accent mb-1.5 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
            {streamLabel}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1 mb-2">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <span
                className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border ${
                  step.active
                    ? 'bg-natural-accent/15 border-natural-accent/40 text-natural-accent'
                    : step.done
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-natural-bg border-natural-border text-natural-text/40'
                }`}
              >
                {step.label}
                {step.active && '…'}
              </span>
              {idx < steps.length - 1 && <span className="text-natural-text/25 text-[8px]">→</span>}
            </React.Fragment>
          ))}
        </div>

        {(reasoning || isReasoningStreaming) && (
          <details open={isReasoningStreaming || reasoning.length > 0} className="mb-1.5">
            <summary className="flex items-center gap-1 text-[9px] text-natural-text/60 hover:text-natural-accent font-semibold cursor-pointer list-none select-none">
              <Brain className="w-3 h-3 text-natural-accent shrink-0" />
              <span>
                {reasoning
                  ? isReasoningStreaming
                    ? '생각하는 중...'
                    : '에이전트의 생각의 흐름'
                  : '추론 준비 중...'}
              </span>
              {isReasoningStreaming && <RefreshCw className="w-3 h-3 animate-spin text-natural-accent ml-1" />}
            </summary>
            <div className="mt-1.5 p-2 rounded-lg bg-natural-bg/50 text-[10px] text-natural-text/80 font-sans border border-natural-border/30 whitespace-pre-line leading-relaxed max-h-[140px] overflow-y-auto scrollbar-thin">
              {reasoning ? formatResponseText(reasoning) : '모델이 섹션 구성과 내용을 구상하고 있습니다...'}
            </div>
          </details>
        )}

        {isDraftStreaming && (
          <div className="mb-1.5 p-2 rounded-lg bg-emerald-50/80 border border-emerald-100 text-[10px] text-emerald-900">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <RefreshCw className="w-3 h-3 animate-spin text-emerald-600 shrink-0" />
              <span>집필 초안 본문 작성 중… (오른쪽 집필 초안 탭에도 실시간 반영)</span>
            </div>
            {draftPreview && (
              <p className="whitespace-pre-line text-emerald-950/80 leading-relaxed max-h-24 overflow-y-auto scrollbar-thin">
                {draftPreview}
                <span className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom bg-emerald-600 animate-pulse" aria-hidden />
              </p>
            )}
          </div>
        )}

        {displayReply ? (
          <p className="whitespace-pre-line">
            {displayReply}
            {isReplyStreaming && (
              <span className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom bg-natural-accent animate-pulse" aria-hidden />
            )}
          </p>
        ) : !isDraftStreaming && !reasoning && streamPhase === 'connecting' ? (
          <div className="flex items-center gap-2 text-natural-text/60 py-0.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-natural-accent shrink-0" />
            <span>에이전트가 응답을 준비하고 있습니다...</span>
          </div>
        ) : null}
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
    streamPhase?: 'connecting' | 'reasoning' | 'draft' | 'reply' | 'critique';
    streamLabel?: string;
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
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const inputTextRef = useRef(inputText);
  const baseTextRef = useRef('');
  const shouldBeListeningRef = useRef(false);
  const lastRecognizedRef = useRef('');

  // Find the latest message that contains context tokens and model used info
  const latestModelMsg = [...history].reverse().find(msg => msg.contextTokens !== undefined);
  const latestContextTokens = latestModelMsg?.contextTokens || 0;
  const latestContextLimit = latestModelMsg?.contextLimit || 1000000;
  const latestOutputTokens = latestModelMsg?.outputTokens || 0;
  const latestOutputLimit = latestModelMsg?.outputTokenLimit || 0;
  const latestModelId = latestModelMsg?.modelUsed || '';
  
  const getModelName = (id: string) => {
    if (!id) return "자동 대기 중...";
    const clean = id.replace(/^cursor:/, '');
    if (clean === 'gemma-4-31b') return "Gemma 4 31B";
    if (clean === 'gemma-4-26b') return "Gemma 4 26B";
    if (clean === 'composer-2.5') return "Composer 2.5";
    return clean;
  };

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  // 음성 입력 시 텍스트가 늘어나도 커서·내용이 항상 보이도록 입력창 크기·스크롤 조정
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${nextHeight}px`;

    const cursorPos = el.value.length;
    el.setSelectionRange(cursorPos, cursorPos);
    el.scrollTop = el.scrollHeight;
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

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText);
    setInputText('');
    baseTextRef.current = '';
    lastRecognizedRef.current = '';
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyMessageText = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(getFullMessageCopyText(msg));
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId((prev) => (prev === msg.id ? null : prev)), 1500);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, isLoading, realTimeProgress?.reply, realTimeProgress?.reasoning, realTimeProgress?.updatedContent]);

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
        <div className="px-4 py-2 bg-natural-sidebar/15 border-b border-natural-border/60 flex flex-col gap-1.5 text-[10px] text-natural-text/85">
          <div className="flex items-center gap-1.5 font-sans font-medium">
            <span className="text-natural-accent">🤖 현재 호출 모델:</span>
            <span className="bg-natural-accent/10 border border-natural-accent/20 px-2 py-0.5 rounded font-bold text-[9.5px] text-natural-accent">
              {getModelName(latestModelId)}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-semibold text-natural-accent shrink-0" title="시스템 지시·대화·응답이 합쳐진 LLM 컨텍스트 점유량">
                📊 컨텍스트:
              </span>
              <div className="w-16 sm:w-24 bg-natural-border/45 h-1.5 rounded-full overflow-hidden shrink-0">
                <div 
                  className="bg-natural-accent h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (latestContextTokens / latestContextLimit) * 100)}%` }}
                />
              </div>
              <span className="font-mono font-bold text-[9px] text-natural-title shrink-0">
                {latestContextTokens.toLocaleString()} / {latestContextLimit.toLocaleString()}
              </span>
            </div>
            {latestOutputLimit > 0 && (
              <div className="flex items-center gap-2 flex-1">
                <span className="font-semibold text-natural-peach shrink-0">📤 최근 출력:</span>
                <div className="w-16 sm:w-24 bg-natural-border/45 h-1.5 rounded-full overflow-hidden shrink-0">
                  <div 
                    className="bg-natural-peach h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (latestOutputTokens / latestOutputLimit) * 100)}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-[9px] text-natural-title shrink-0">
                  {latestOutputTokens.toLocaleString()} / {latestOutputLimit.toLocaleString()}
                </span>
              </div>
            )}
          </div>
          <p className="text-[8.5px] text-natural-text/45 leading-snug">
            LLM이 이번 세션에서 기억하고 있는 전체 분량 (시스템 지시 + 대화 + 응답)
          </p>
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
                  <p className="whitespace-pre-wrap break-words">{formatResponseText(msg.text)}</p>
                  
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
                          <span className="font-semibold text-natural-accent" title="시스템 지시·대화·응답 합산">
                            📊 누적 컨텍스트:
                          </span>
                          <span className="font-mono text-[8.5px] text-natural-text/80">
                            {msg.contextTokens.toLocaleString()} / {msg.contextLimit.toLocaleString()} tokens
                          </span>
                        </div>
                        <span className="font-bold text-[8.5px] text-natural-accent bg-natural-accent/10 px-1.5 py-0.5 rounded shrink-0">
                          {((msg.contextTokens / msg.contextLimit) * 100).toFixed(2)}%
                        </span>
                      </div>
                      {msg.outputTokenLimit !== undefined && msg.outputTokenLimit > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-natural-peach">📤 이번 응답 출력:</span>
                            <span className="font-mono text-[8.5px] text-natural-text/80">
                              {(msg.outputTokens || 0).toLocaleString()} / {msg.outputTokenLimit.toLocaleString()} tokens
                            </span>
                          </div>
                          <span className="font-bold text-[8.5px] text-natural-peach bg-natural-peach/10 px-1.5 py-0.5 rounded shrink-0">
                            {(((msg.outputTokens || 0) / msg.outputTokenLimit) * 100).toFixed(2)}%
                          </span>
                        </div>
                      )}
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

                  <div
                    className={`flex items-center justify-end gap-1 mt-1 ${
                      isUser ? 'text-white/70' : 'text-natural-text/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => copyMessageText(msg)}
                      className={`p-0.5 rounded shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer ${
                        isUser ? 'hover:bg-white/10' : 'hover:bg-natural-sidebar/60'
                      }`}
                      title="메시지 전문 복사"
                      aria-label="메시지 전문 복사"
                    >
                      {copiedMsgId === msg.id ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Clipboard className="w-3 h-3" />
                      )}
                    </button>
                    <span className="text-[8px] font-mono leading-none">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        
        {isLoading && (
          <StreamingModelMessage progress={realTimeProgress} />
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
        <form onSubmit={handleSend} className="flex flex-col gap-1">
          <div className="flex gap-1.5 items-end">
            <textarea
              id="chat-text-input"
              ref={inputRef}
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              rows={1}
              placeholder={
                isLoading
                  ? '에이전트가 응답 중입니다. 다음 메시지를 미리 적어 두셔도 됩니다...'
                  : status === 'interviewing'
                    ? '여기에 생각을 더 입력하거나 질문에 답해 보세요...'
                    : '비평을 보고 아이디어를 더 보충하거나 고쳐 보세요...'
              }
              className="flex-1 min-w-0 bg-natural-card border border-natural-border rounded-xl px-3 py-2 text-xs text-natural-title placeholder-natural-text/40 focus:outline-none focus:ring-1 focus:ring-natural-accent resize-none overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap leading-relaxed max-h-40"
            />
            <div className="flex gap-1.5 shrink-0">
              <button
                id="chat-voice-input-btn"
                type="button"
                onClick={toggleListening}
                disabled={isLoading}
                className={`w-9 h-9 rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 border-rose-600 text-white animate-pulse shadow-sm'
                    : 'bg-natural-card border-natural-border hover:border-natural-accent/30 text-natural-text/70 hover:text-natural-title'
                }`}
                title={isListening ? '음성 인식 중 (클릭하여 멈춤)' : '음성으로 받아쓰기'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                id="chat-send-submit"
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className={`w-9 h-9 rounded-xl transition flex items-center justify-center shrink-0 shadow-sm ${
                  isLoading
                    ? 'bg-natural-accent/80 text-white cursor-wait'
                    : 'bg-natural-accent hover:bg-natural-accent-hover text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title={isLoading ? '에이전트가 응답을 준비하고 있습니다' : '전송'}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <span className="text-[9px] text-natural-text/40 px-1 select-none">
            Enter 전송 · Shift+Enter 줄바꿈
          </span>
        </form>
      </div>
    </div>
  );
}
