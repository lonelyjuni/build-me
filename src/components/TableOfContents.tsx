import React, { useState } from 'react';
import { TocSection } from '../types';
import { buildTocDisplayRows } from '../tocUtils';
import { BookOpen, ChevronRight, ChevronDown, ChevronsDown, ChevronsUp } from 'lucide-react';

interface TableOfContentsProps {
  toc: TocSection[];
  currentSectionId: string | null;
  onSelectSection?: (id: string) => void;
  onUpdateToc?: (newToc: TocSection[]) => void;
}

export default function TableOfContents({
  toc,
  currentSectionId,
  onSelectSection,
}: TableOfContentsProps) {
  const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});

  const numberedRows = buildTocDisplayRows(toc);

  const toggleCollapse = (parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const handleCollapseAll = () => {
    const newCollapsed: Record<string, boolean> = {};
    numberedRows.filter((r) => !r.isSub).forEach((r) => {
      newCollapsed[r.id] = true;
    });
    setCollapsedParents(newCollapsed);
  };

  const handleExpandAll = () => {
    setCollapsedParents({});
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-transparent" id="toc-panel">
      <div className="px-4 py-2 bg-natural-sidebar/35 border-b border-natural-border flex items-center justify-between shrink-0" id="toc-header">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-natural-accent" />
          <span className="font-bold text-xs text-natural-title font-sans">목차</span>
        </div>

        {toc.length > 0 && (
          <div className="flex items-center gap-1 shrink-0 animate-fadeIn">
            <button
              onClick={handleExpandAll}
              className="p-1 px-2 bg-natural-card hover:bg-natural-accent/10 border border-natural-border/60 text-natural-title text-[9px] font-semibold rounded-md flex items-center gap-0.5 cursor-pointer transition-all shadow-3xs"
              title="모두 펴기"
            >
              <ChevronsDown className="w-2.5 h-2.5 text-natural-accent" />
              <span>모두 펴기</span>
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-1 px-2 bg-natural-card hover:bg-natural-accent/10 border border-natural-border/60 text-natural-title text-[9px] font-semibold rounded-md flex items-center gap-0.5 cursor-pointer transition-all shadow-3xs"
              title="모두 접기"
            >
              <ChevronsUp className="w-2.5 h-2.5 text-natural-text/60" />
              <span>모두 접기</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin" id="toc-list">
        {toc.length === 0 ? (
          <div className="p-8 text-center text-natural-text/50 text-xs italic leading-relaxed" id="toc-empty">
            AI와 인터뷰를 좀 더 나누면<br />
            실시간으로 기획의 뼈대가 되는<br />
            <span className="text-natural-accent font-semibold not-italic">스마트 맞춤형 목차</span>가 여기에 구성됩니다.
          </div>
        ) : (
          numberedRows.map((row) => {
            const isSub = row.isSub;
            const parentId = row.parentId;
            const isCollapsed = parentId ? collapsedParents[parentId] : false;

            if (isSub && isCollapsed) {
              return null;
            }

            const isFocus = row.id === currentSectionId;
            const hasChildren = numberedRows.some((r) => r.isSub && r.parentId === row.id);
            const isParentCollapsed = collapsedParents[row.id];

            return (
              <div
                key={row.id}
                id={`toc-item-${row.id}`}
                onClick={() => !row.isGroupHeader && onSelectSection?.(row.id)}
                className={`flex items-center justify-between py-1 px-2.5 rounded-md border transition-all ${
                  row.isGroupHeader ? 'cursor-default' : 'cursor-pointer hover:border-natural-accent/20'
                } ${
                  isFocus
                    ? 'bg-natural-accent/5 border-natural-accent/30 text-natural-title font-medium'
                    : 'bg-natural-card border-natural-border/20 text-natural-text'
                } ${isSub ? 'ml-3' : ''}`}
              >
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  {!isSub ? (
                    hasChildren ? (
                      <button
                        onClick={(e) => toggleCollapse(row.id, e)}
                        className="p-0.5 hover:bg-natural-sidebar/60 rounded transition-all shrink-0 text-natural-accent/70 cursor-pointer"
                      >
                        {isParentCollapsed ? (
                          <ChevronRight className="w-2.5 h-2.5" />
                        ) : (
                          <ChevronDown className="w-2.5 h-2.5" />
                        )}
                      </button>
                    ) : (
                      <ChevronRight className="w-2.5 h-2.5 text-natural-accent/30 shrink-0" />
                    )
                  ) : (
                    <span className="text-natural-accent/30 text-[9px] font-mono shrink-0 select-none ml-1">└</span>
                  )}

                  <div className="flex flex-col min-w-0">
                    <span className={`text-[10.5px] leading-tight break-words flex items-start gap-1.5 ${isSub ? 'text-natural-text/80' : 'font-bold text-natural-title'}`}>
                      <span className="text-[9px] font-mono font-bold text-natural-accent shrink-0 pt-0.5">
                        {row.displayNumber}.
                      </span>
                      <span className="min-w-0">{row.displayTitle}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-1.5 shrink-0">
                  {row.isGroupHeader ? (
                    <span className="text-[7.5px] font-sans text-natural-text/35 px-1">그룹</span>
                  ) : (
                    <span className={`text-[7.5px] font-sans font-bold px-1 rounded-sm ${
                      row.status === 'completed'
                        ? 'bg-natural-accent/10 text-natural-accent-hover border border-natural-accent/15'
                        : row.status === 'writing'
                        ? 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse'
                        : row.status === 'reviewing'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-natural-bg text-natural-text/40 border border-natural-border/20'
                    }`}>
                      {row.status === 'completed' && '완료'}
                      {row.status === 'writing' && '작성중'}
                      {row.status === 'reviewing' && '검토중'}
                      {row.status === 'pending' && '대기'}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-2.5 border-t border-natural-border bg-natural-sidebar/10 text-[10px] text-natural-text/50 leading-relaxed shrink-0" id="toc-info-footer">
        💡 <span className="font-semibold text-natural-title">목차</span>는 대화 맥락과 진행 상황을 AI가 직접 평가하여 자동으로 다듬고 채워나가는 공간입니다.
      </div>
    </div>
  );
}
