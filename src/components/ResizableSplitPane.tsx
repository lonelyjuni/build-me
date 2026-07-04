import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ResizableSplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey?: string;
  initialLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
  className?: string;
}

export default function ResizableSplitPane({
  left,
  right,
  storageKey = 'buildme_split_percent',
  initialLeftPercent = 50,
  minLeftPercent = 28,
  maxLeftPercent = 72,
  className = '',
}: ResizableSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState(() => {
    if (typeof window === 'undefined') return initialLeftPercent;
    const saved = localStorage.getItem(storageKey);
    const n = saved ? Number(saved) : initialLeftPercent;
    return Number.isFinite(n) ? Math.min(maxLeftPercent, Math.max(minLeftPercent, n)) : initialLeftPercent;
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(storageKey, String(Math.round(leftPercent)));
  }, [leftPercent, storageKey]);

  useEffect(() => {
    if (!isDragging) return;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPercent(Math.min(maxLeftPercent, Math.max(minLeftPercent, pct)));
    },
    [isDragging, minLeftPercent, maxLeftPercent]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 min-h-0 overflow-hidden ${className}`}
      id="workspace-split-pane"
    >
      <div
        className="min-w-0 flex flex-col h-full overflow-hidden"
        style={{ width: `${leftPercent}%` }}
        id="left-workspace-panel"
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="채팅과 목차 영역 너비 조절"
        title="드래그하여 너비 조절"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`group relative w-2 shrink-0 cursor-col-resize flex items-center justify-center touch-none select-none ${
          isDragging ? 'bg-natural-accent/20' : 'hover:bg-natural-accent/10'
        }`}
        id="workspace-split-handle"
      >
        <div
          className={`w-0.5 h-12 rounded-full transition-colors ${
            isDragging ? 'bg-natural-accent' : 'bg-natural-border group-hover:bg-natural-accent/70'
          }`}
        />
      </div>

      <div className="min-w-0 flex-1 flex flex-col h-full overflow-hidden" id="right-workspace-panel">
        {right}
      </div>
    </div>
  );
}
