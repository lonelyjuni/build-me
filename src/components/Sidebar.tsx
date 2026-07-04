import React, { useState } from 'react';
import { BrainstormSession } from '../types';
import { Plus, BookOpen, MessageSquare, Trash2, Edit3, ArrowRight } from 'lucide-react';

interface SidebarProps {
  sessions: BrainstormSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onCreateSession: (rawIdea: string) => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onCreateSession,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newIdea, setNewIdea] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdea.trim()) return;
    onCreateSession(newIdea);
    setNewIdea('');
    setShowCreateModal(false);
  };

  return (
    <div className="w-full md:w-80 bg-natural-sidebar border-r border-natural-border flex flex-col h-full text-natural-text" id="sidebar-container">
      {/* Header */}
      <div className="p-5 border-b border-natural-border flex items-center justify-between bg-natural-sidebar/50" id="sidebar-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-natural-accent flex items-center justify-center font-bold text-white text-sm shadow-sm">
            🌱
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-md text-natural-title font-sans">BuildMe</h1>
            <p className="text-[10px] text-natural-text/60 font-mono tracking-wider uppercase">Idea Architect v1.0</p>
          </div>
        </div>
      </div>

      {/* New Brainstorm button */}
      <div className="p-4" id="new-brainstorm-btn-wrapper">
        <button
          id="btn-new-brainstorm"
          onClick={() => setShowCreateModal(true)}
          className="w-full py-2.5 px-4 rounded-xl bg-natural-card hover:bg-natural-hover border border-natural-border hover:border-natural-accent/30 shadow-sm transition-all flex items-center justify-center gap-2 text-xs font-semibold text-natural-title cursor-pointer"
        >
          <Plus className="w-4 h-4 text-natural-accent" />
          새로운 생각 빌드업
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5" id="sidebar-sessions-list">
        <div className="px-2 py-1 text-[10px] font-bold text-natural-text/50 uppercase tracking-widest font-mono">
          내 빌드미 프로젝트 ({sessions.length})
        </div>
        
        {sessions.length === 0 ? (
          <div className="p-6 text-center text-natural-text/40 text-xs italic" id="no-sessions-fallback">
            작성된 기획서가 없습니다.<br />위의 버튼을 눌러 시작해 보세요.
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const completedSections = session.toc.filter(s => s.status === 'completed').length;
            const totalSections = session.toc.length;
            const progress = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

            return (
              <div
                key={session.id}
                id={`session-item-${session.id}`}
                className={`group relative flex flex-col p-3.5 rounded-xl cursor-pointer border transition-all ${
                  isActive
                    ? 'bg-natural-card border-natural-border text-natural-title shadow-sm'
                    : 'hover:bg-natural-card/40 border-transparent text-natural-text hover:text-natural-title'
                }`}
                onClick={() => onSelectSession(session.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-xs truncate pr-6 text-natural-title">
                      {session.title || '새 프로젝트 (인터뷰 중)'}
                    </h3>
                    <p className="text-[11px] text-natural-text/70 truncate mt-0.5">
                      {session.rawIdea}
                    </p>
                  </div>
                  <button
                    id={`btn-delete-session-${session.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('정말로 이 빌드업 세션을 삭제하시겠습니까? 모든 대화와 작성된 위키가 지워집니다.')) {
                        onDeleteSession(session.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 absolute top-3.5 right-3.5 p-1 rounded hover:bg-natural-hover text-natural-text/50 hover:text-rose-600 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-natural-text/50">
                  <span className="capitalize px-2 py-0.5 rounded bg-natural-bg text-natural-text font-semibold">
                    {session.status === 'interviewing' && '🧠 인터뷰'}
                    {session.status === 'writing' && '✍️ 기획서 집필'}
                    {session.status === 'reviewing' && '🧐 맥킨지 비평'}
                    {session.status === 'completed' && '✅ 빌드업 완료'}
                  </span>
                  
                  {totalSections > 0 && (
                    <span className="text-natural-text/60">
                      진척도 {completedSections}/{totalSections} ({progress}%)
                    </span>
                  )}
                </div>
                
                {totalSections > 0 && (
                  <div className="w-full bg-[#E2DDD4] h-1 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-natural-accent h-full transition-all duration-300" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-natural-border text-[11px] text-natural-text/70 bg-natural-sidebar flex flex-col gap-1" id="sidebar-footer">
        <div className="flex justify-between">
          <span>모바일 화면 최적화</span>
          <span className="text-natural-accent font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-natural-accent inline-block animate-ping" />
            Active
          </span>
        </div>
        <div className="text-[10px] text-natural-text/50 font-mono">
          Tip: [확정] 또는 [저장]을 입력하면 위키에 반영됩니다.
        </div>
      </div>

      {/* Create Brainstorm Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs" id="create-session-modal">
          <div className="bg-natural-card border border-natural-border p-6 rounded-2xl w-full max-w-md shadow-xl relative text-natural-text">
            <h2 className="text-md font-bold text-natural-title mb-1.5 flex items-center gap-2 font-serif">
              🌱 거친 아이디어 던지기
            </h2>
            <p className="text-xs text-natural-text/80 mb-4 leading-relaxed">
              머릿속에 떠다니는 생각, 미완성 비즈니스 모델, 글의 소재 등을 자유롭게 한 줄 이상 던져주세요. 빌드미가 인터뷰를 시작합니다.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                id="input-raw-idea"
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                placeholder="예: AI를 활용해 하루 식단을 개인 맞춤형으로 짜주고 식재료를 장바구니에 바로 담아주는 구독 서비스 기획해보고 싶어. 모바일 우선으로 가고 싶고..."
                rows={4}
                className="w-full p-3 rounded-xl bg-natural-bg border border-natural-border text-natural-title text-xs focus:outline-none focus:ring-1 focus:ring-natural-accent placeholder-natural-text/40"
                required
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  id="btn-modal-cancel"
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl hover:bg-natural-bg text-natural-text font-medium transition cursor-pointer"
                >
                  취소
                </button>
                <button
                  id="btn-modal-submit"
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-natural-accent hover:bg-natural-accent-hover text-white font-semibold transition flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  빌드업 시작
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
