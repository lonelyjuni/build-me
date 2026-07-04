import React, { useState, useEffect } from 'react';
import { TocSection } from '../types';
import { getSectionDisplayLabel, getWritableSections, buildFullWikiMarkdown } from '../tocUtils';
import { sanitizeDraftContent } from '../contentUtils';
import ReactMarkdown from 'react-markdown';
import { FileText, Clipboard, Download, CheckCircle, BookOpen } from 'lucide-react';
import TableOfContents from './TableOfContents';

interface DocPreviewProps {
  currentSection: TocSection | null;
  toc: TocSection[];
  currentSectionId: string | null;
  onSelectSection: (id: string) => void;
  onUpdateToc: (newToc: TocSection[]) => void;
  onConfirmSection: () => void;
  isLoading?: boolean;
  streamingDraft?: string;
}

export default function DocPreview({
  currentSection,
  toc,
  currentSectionId,
  onSelectSection,
  onUpdateToc,
  onConfirmSection,
  isLoading = false,
  streamingDraft = '',
}: DocPreviewProps) {
  const [activeTab, setActiveTab] = useState<'toc' | 'draft' | 'full'>('toc');
  const [copied, setCopied] = useState(false);

  // Auto-switch to draft tab when finalized content arrives (not during initial stream)
  useEffect(() => {
    if (currentSection?.content) {
      setActiveTab('draft');
    }
  }, [currentSection?.id, currentSection?.content]);

  const draftContent = sanitizeDraftContent(streamingDraft || currentSection?.content || '');

  const fullWikiMarkdown = buildFullWikiMarkdown(toc);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const downloadMarkdown = () => {
    const fullText = fullWikiMarkdown;
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `buildme-wiki-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col w-full h-full bg-natural-card border border-natural-border rounded-2xl overflow-hidden shadow-sm" id="doc-preview-panel">
      {/* Tabs Menu */}
      <div className="flex items-center justify-between border-b border-natural-border bg-natural-sidebar/35 px-2 md:px-4 shrink-0" id="doc-preview-tabs">
        <div className="flex gap-1 py-1.5 overflow-x-auto whitespace-nowrap scrollbar-none max-w-[calc(100%-55px)]">
          <button
            id="tab-btn-toc"
            onClick={() => setActiveTab('toc')}
            className={`px-2 py-1 rounded-xl text-[11px] md:text-xs font-semibold transition flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'toc'
                ? 'bg-natural-card text-natural-title border border-natural-border shadow-xs'
                : 'text-natural-text/75 hover:text-natural-title'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-natural-accent" />
            <span>목차</span>
          </button>

          <button
            id="tab-btn-draft"
            onClick={() => setActiveTab('draft')}
            className={`px-2 py-1 rounded-xl text-[11px] md:text-xs font-semibold transition flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'draft'
                ? 'bg-natural-card text-natural-title border border-natural-border shadow-xs'
                : 'text-natural-text/75 hover:text-natural-title'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span>집필 초안</span>
          </button>
          
          <button
            id="tab-btn-full"
            onClick={() => setActiveTab('full')}
            className={`px-2 py-1 rounded-xl text-[11px] md:text-xs font-semibold transition flex items-center gap-1 shrink-0 cursor-pointer whitespace-nowrap ${
              activeTab === 'full'
                ? 'bg-natural-card text-natural-title border border-natural-border shadow-xs'
                : 'text-natural-text/75 hover:text-natural-title'
            }`}
          >
            📚
            <span>전체 기획 위키 (전문)</span>
          </button>
        </div>

        {/* Copy / Download tools */}
        <div className="flex gap-1 shrink-0">
          <button
            id="btn-copy-doc"
            onClick={() => copyToClipboard(activeTab === 'full' ? fullWikiMarkdown : draftContent)}
            className="p-1.5 rounded hover:bg-natural-hover text-natural-text/60 hover:text-natural-title transition cursor-pointer"
            title="마크다운 복사"
          >
            <Clipboard className="w-3.5 h-3.5" />
          </button>
          <button
            id="btn-download-doc"
            onClick={downloadMarkdown}
            className="p-1.5 rounded hover:bg-natural-hover text-natural-text/60 hover:text-natural-title transition cursor-pointer"
            title="기획서 .md 다운로드"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Preview Content */}
      <div className="flex-1 overflow-hidden flex flex-col text-natural-text" id="preview-body-container">
        {copied && (
          <div className="mx-5 mt-4 bg-natural-accent/10 border border-natural-accent/25 text-natural-accent-hover text-[10px] py-1 px-3 rounded-md text-center font-semibold font-mono shrink-0">
            복사 완료! 클립보드에 마크다운 형식이 임시 보관되었습니다.
          </div>
        )}

        {activeTab === 'toc' && (
          <div className="flex-1 min-h-0 flex flex-col" id="toc-tab-content">
            <TableOfContents
              toc={toc}
              currentSectionId={currentSectionId}
              onSelectSection={(id) => {
                onSelectSection(id);
                // When selecting a section, switch to draft tab automatically so user can see it
                setActiveTab('draft');
              }}
              onUpdateToc={onUpdateToc}
            />
          </div>
        )}

        {activeTab === 'draft' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 animate-fadeIn" id="draft-tab-content">
            {currentSection ? (
              <div className="prose prose-stone max-w-none text-natural-text text-xs leading-relaxed space-y-4">
                <div className="flex items-center justify-between border-b border-natural-border/60 pb-2 mb-3">
                  <h2 className="text-sm font-bold text-natural-accent flex items-center gap-1.5 font-serif">
                    <FileText className="w-4 h-4" /> {getSectionDisplayLabel(currentSection, toc)}
                  </h2>
                  <span className="text-[10px] font-mono text-natural-text/50">
                    {isLoading && streamingDraft ? '본문 작성 중...' : `진행 상태: ${currentSection.status}`}
                  </span>
                </div>

                <p className="text-[10px] text-natural-text/45 -mt-2 mb-1">
                  이 탭에는 기획서 본문만 표시됩니다. AI 설명·비평·피드백 대화는 왼쪽 채팅창을 확인하세요.
                </p>

                {draftContent ? (
                  <div className="markdown-body bg-natural-bg/25 p-4 rounded-xl border border-natural-border/40 font-sans">
                    <ReactMarkdown>{draftContent}</ReactMarkdown>
                    {isLoading && streamingDraft && (
                      <span className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom bg-natural-accent animate-pulse" />
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-natural-bg/10 border border-dashed border-natural-border rounded-xl">
                    <p className="text-natural-text/50 text-xs italic">
                      AI가 이 섹션의 초안을 작성하면<br />여기에 실시간으로 표시됩니다.
                    </p>
                  </div>
                )}

                {draftContent && currentSection.status !== 'completed' && !isLoading && (
                  <div className="pt-4 flex justify-end">
                    <button
                      id="btn-confirm-section-preview"
                      onClick={onConfirmSection}
                      className="px-4 py-2 bg-natural-accent hover:bg-natural-accent-hover text-white font-bold rounded-xl transition text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" />
                      이 내용으로 확정하고 위키에 저장
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12" id="draft-no-focus">
                <FileText className="w-10 h-10 text-natural-text/30 mb-2" />
                <h4 className="font-bold text-natural-title text-xs mb-1 font-serif">선택된 섹션이 없습니다</h4>
                <p className="text-[11px] text-natural-text/60 max-w-xs leading-relaxed">
                  '목차' 탭에서 원하는 섹션을 클릭해 집필을 시작하거나 활성화해 보세요.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'full' && (
          <div className="flex-1 overflow-y-auto animate-fadeIn" id="full-wiki-tab-content">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-natural-border/60 bg-natural-card/95 backdrop-blur-sm px-5 py-2.5">
              <h2 className="text-sm font-bold text-natural-title flex items-center gap-1.5 font-serif">
                📚 전체 기획 위키 문서
              </h2>
              <span className="text-[10px] font-mono text-natural-text/50">
                {getWritableSections(toc).length}개 집필 섹션
              </span>
            </div>

            <div className="markdown-body prose prose-stone max-w-none px-6 py-5 text-natural-text text-[13px] leading-relaxed">
              <ReactMarkdown>{fullWikiMarkdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
