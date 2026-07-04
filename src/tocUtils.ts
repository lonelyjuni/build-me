import { TocSection } from './types';
import { sanitizeDraftContent } from './contentUtils';

export interface TocDisplayRow {
  id: string;
  title: string;
  displayNumber: string;
  displayTitle: string;
  isSub: boolean;
  isGroupHeader: boolean;
  status: TocSection['status'];
  originalSection: TocSection;
  parentId?: string;
}

export function stripLeadingNumber(title: string): string {
  return title.trim().replace(/^(\d+\.)+\d*\s+/, '').replace(/^\d+\.\s+/, '').trim() || title.trim();
}

function parseSectionNumber(title: string): {
  kind: 'parent' | 'child' | 'none';
  parentNum?: number;
  childNum?: number;
  cleanTitle: string;
} {
  const trimmed = title.trim();
  const childMatch = trimmed.match(/^(\d+)\.(\d+)\s*(.*)$/);
  if (childMatch) {
    return {
      kind: 'child',
      parentNum: Number(childMatch[1]),
      childNum: Number(childMatch[2]),
      cleanTitle: childMatch[3].trim() || trimmed,
    };
  }
  const parentMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
  if (parentMatch) {
    return {
      kind: 'parent',
      parentNum: Number(parentMatch[1]),
      cleanTitle: parentMatch[2].trim(),
    };
  }
  return { kind: 'none', cleanTitle: trimmed };
}

/** 영문 카테고리명·짧은 설명 라벨 — 별도 목차 항목이 아니라 괄호로 붙임 */
export function isAnnotationLabel(title: string): boolean {
  const t = title.trim();
  if (!t || /^\d/.test(t)) return false;
  if (/^[A-Za-z][A-Za-z0-9\s\-&/().]*$/.test(t) && t.length <= 120) return true;
  if (!/\d/.test(t) && t.length <= 50 && !t.startsWith('(')) return true;
  return false;
}

function appendAnnotationTitle(baseTitle: string, label: string): string {
  const base = baseTitle.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return `${base} (${label.trim()})`;
}

function parseParenthesesChildren(text: string): { parentTitle: string; children: string[] } | null {
  const match = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return null;

  const parentTitle = match[1].trim();
  const inner = match[2].trim();
  if (!/\d+\.\d+/.test(inner)) return null;

  const children = inner.split(/,\s*(?=\d+\.\d+)/).map((p) => p.trim()).filter(Boolean);
  if (children.length === 0) return null;

  return { parentTitle, children };
}

function makeChildId(parentId: string, childNum: number, index: number): string {
  return `${parentId}_sub_${childNum ?? index}`;
}

/** AI가 만든 평면 목차를 정규화: 라벨 병합, 괄호 하위 펼침, parentId·그룹 헤더 설정 */
export function normalizeTocSections(sections: TocSection[]): TocSection[] {
  if (sections.length === 0) return [];

  const expanded: TocSection[] = [];

  for (const sec of sections) {
    const paren = parseParenthesesChildren(sec.title);
    if (paren) {
      const parentNum = parseSectionNumber(paren.parentTitle).parentNum;
      const parentTitle = parentNum
        ? `${parentNum}. ${stripLeadingNumber(paren.parentTitle)}`
        : paren.parentTitle;

      expanded.push({
        ...sec,
        title: parentTitle,
        isGroupHeader: true,
        content: sec.content || '',
      });

      paren.children.forEach((childTitle, idx) => {
        const parsed = parseSectionNumber(childTitle);
        const childNum = parsed.childNum ?? idx + 1;
        const numPrefix = parsed.parentNum && parsed.childNum
          ? `${parsed.parentNum}.${parsed.childNum}`
          : parentNum
            ? `${parentNum}.${childNum}`
            : '';
        const title = numPrefix
          ? `${numPrefix} ${stripLeadingNumber(childTitle)}`
          : childTitle;

        expanded.push({
          id: makeChildId(sec.id, childNum, idx),
          title,
          status: sec.status === 'completed' ? 'pending' : sec.status,
          content: '',
          feedback: '',
          parentId: sec.id,
        });
      });
      continue;
    }

    expanded.push({ ...sec });
  }

  const merged: TocSection[] = [];
  for (const sec of expanded) {
    if (isAnnotationLabel(sec.title) && merged.length > 0) {
      const last = merged[merged.length - 1];
      merged[merged.length - 1] = {
        ...last,
        title: appendAnnotationTitle(last.title, sec.title),
      };
      continue;
    }
    merged.push({ ...sec });
  }

  const normalized: TocSection[] = merged.map((sec) => {
    const parsed = parseSectionNumber(sec.title);
    if (parsed.kind === 'parent' && parsed.parentNum) {
      return {
        ...sec,
        title: `${parsed.parentNum}. ${stripLeadingNumber(parsed.cleanTitle)}`,
      };
    }
    if (parsed.kind === 'child' && parsed.parentNum && parsed.childNum) {
      return {
        ...sec,
        title: `${parsed.parentNum}.${parsed.childNum} ${stripLeadingNumber(parsed.cleanTitle)}`,
      };
    }
    return sec;
  });

  const parentIdByNum: Record<number, string> = {};
  for (const sec of normalized) {
    const parsed = parseSectionNumber(sec.title);
    if (parsed.kind === 'parent' && parsed.parentNum) {
      parentIdByNum[parsed.parentNum] = sec.id;
    }
  }

  const withParents = normalized.map((sec) => {
    const parsed = parseSectionNumber(sec.title);
    if (parsed.kind === 'child' && parsed.parentNum) {
      return { ...sec, parentId: sec.parentId || parentIdByNum[parsed.parentNum] };
    }
    return sec;
  });

  const parentIdsWithChildren = new Set(
    withParents.filter((s) => s.parentId).map((s) => s.parentId as string)
  );

  return withParents.map((sec) => {
    if (parentIdsWithChildren.has(sec.id)) {
      return { ...sec, isGroupHeader: true };
    }
    return sec;
  });
}

export function mergeTocSections(
  existing: TocSection[],
  suggested?: TocSection[]
): TocSection[] {
  if (!suggested || suggested.length === 0) {
    return normalizeTocSections(existing);
  }

  const normalizedSuggested = normalizeTocSections(suggested);
  const existingById = Object.fromEntries(existing.map((s) => [s.id, s]));
  const existingByTitle = Object.fromEntries(
    existing.map((s) => [stripLeadingNumber(s.title).toLowerCase(), s])
  );

  const merged = normalizedSuggested.flatMap((s) => {
    if (isPollutedTocTitle(s.title) || isInterviewQuestionTitle(s.title)) {
      return [];
    }

    const old = existingById[s.id] || existingByTitle[stripLeadingNumber(s.title).toLowerCase()];
    if (!old) return [s];

    return [
      {
        ...old,
        content: s.content?.trim() ? s.content : old.content,
        feedback: s.feedback || old.feedback,
        status:
          old.status === 'completed'
            ? ('completed' as const)
            : (s.status || old.status),
      },
    ];
  });

  for (const old of existing) {
    const titleKey = stripLeadingNumber(old.title).toLowerCase();
    const alreadyMerged = merged.some(
      (m) => m.id === old.id || stripLeadingNumber(m.title).toLowerCase() === titleKey
    );
    if (!alreadyMerged) {
      merged.push(old);
    }
  }

  return sortTocSections(normalizeTocSections(merged));
}

/** 인터뷰 질문이 목차에 잘못 들어간 경우 감지 */
export function isInterviewQuestionToc(toc: TocSection[]): boolean {
  const normalized = normalizeTocSections(toc);
  if (normalized.length === 0) return false;

  const questionLike = normalized.filter((s) => isInterviewQuestionTitle(s.title));
  return questionLike.length >= Math.ceil(normalized.length / 2);
}

export function isInterviewQuestionTitle(title: string): boolean {
  const t = stripLeadingNumber(title).trim();
  return (
    /[?？]$/.test(t) ||
    /무엇인가요|누구인가요|있나요|어떻게|어떤|차별화.*포인트|타겟은|목적이|강조하거나|포함하고 싶은/i.test(t)
  );
}

/** AI 답변·초안 설명이 목차 제목으로 잘못 들어간 경우 */
export function isPollutedTocTitle(title: string): boolean {
  const t = stripLeadingNumber(title).trim();
  if (t.length > 72) return true;
  if (/작성했습니다|초안을 작성|말씀해\s*주세요|동의하시나요|구성했습니다|이 섹션은|역할을 합니다|설정하여/.test(t)) {
    return true;
  }
  if ((t.match(/[.?!…]/g) || []).length >= 2) return true;
  return false;
}

/** 오염된 목차 제목을 짧은 제목으로 복구 */
export function repairTocSectionTitle(sec: TocSection): TocSection {
  if (!isPollutedTocTitle(sec.title)) return sec;

  const quoted = sec.title.match(/['「『]([^'」』]{2,48})['」』]/);
  const parsed = parseSectionNumber(sec.title);
  const shortName = quoted?.[1]?.trim() || stripLeadingNumber(sec.title).slice(0, 24);

  let title: string;
  if (parsed.kind === 'child' && parsed.parentNum && parsed.childNum) {
    title = `${parsed.parentNum}.${parsed.childNum} ${shortName}`;
  } else if (parsed.kind === 'parent' && parsed.parentNum) {
    title = `${parsed.parentNum}. ${shortName}`;
  } else {
    const num = sec.title.match(/^(\d+(?:\.\d+)?)/)?.[1];
    title = num ? (num.includes('.') ? `${num} ${shortName}` : `${num}. ${shortName}`) : shortName;
  }

  return { ...sec, title };
}

export function repairTocSections(toc: TocSection[]): TocSection[] {
  return normalizeTocSections(toc).map(repairTocSectionTitle);
}

/** 문서 목차로 쓸 수 있는 항목만 남김 (인터뷰 질문·답변 문장 제외) */
export function filterDocumentTocSections(suggested: TocSection[]): TocSection[] {
  return normalizeTocSections(suggested).filter(
    (s) => !isInterviewQuestionTitle(s.title) && !isPollutedTocTitle(s.title)
  );
}

export function sortTocSections(sections: TocSection[]): TocSection[] {
  const key = (sec: TocSection): number => {
    const parsed = parseSectionNumber(sec.title);
    if (parsed.kind === 'child' && parsed.parentNum != null && parsed.childNum != null) {
      return parsed.parentNum * 1000 + parsed.childNum;
    }
    if (parsed.kind === 'parent' && parsed.parentNum != null) {
      return parsed.parentNum * 1000;
    }
    return 999_999;
  };
  return [...sections].sort((a, b) => key(a) - key(b) || a.title.localeCompare(b.title, 'ko'));
}

/** 사용자가 목차 추가·변경·옵션 선택을 요청했는지 */
export function userRequestsTocUpdate(userMessage?: string, reply?: string): boolean {
  const u = (userMessage || '').trim();
  if (!u && !reply) return false;

  if (/옵션\s*[A-Da-d]/i.test(u)) return true;
  if (/목차.*(다시|재구성|바꿔|잡아|추가|신설|수정)|다시.*목차|전체.*목차/i.test(u)) return true;
  if (/(추가|신설|넣).{0,20}(장|목차|섹션|챕터|파트)/i.test(u)) return true;
  if (/\d+\s*장/.test(u) && /(추가|신설|넣|만들)/i.test(u)) return true;

  const r = (reply || '').trim();
  if (r && /목차에.*(추가|신설)|신설.*목차|새.*장|5\.\s+\S/.test(r)) return true;

  return false;
}

export function hasNewTocSections(existing: TocSection[], suggested: TocSection[]): boolean {
  const keys = new Set(
    existing.map((s) => `${s.id}|${stripLeadingNumber(s.title).toLowerCase()}`)
  );
  return suggested.some((s) => {
    const key = `${s.id}|${stripLeadingNumber(s.title).toLowerCase()}`;
    return !keys.has(key);
  });
}

export function isInterviewPhaseToc(suggested: TocSection[]): boolean {
  const normalized = normalizeTocSections(suggested);
  return normalized.length > 0 && normalized.every((s) => isInterviewQuestionTitle(s.title));
}

/** 기존 목차를 버리고 새 목차로 통째로 교체할지 */
export function shouldReplaceTocEntirely(
  existing: TocSection[],
  suggested: TocSection[],
  reply?: string,
  userMessage?: string
): boolean {
  if (existing.length === 0 || !suggested.length) return false;
  if (isInterviewQuestionToc(existing)) return true;

  const userIntent = userMessage || "";
  if (/옵션\s*[A-Da-d]/i.test(userIntent)) return false;
  if (/목차.*(다시|재구성|바꿔|잡아)|다시.*목차|전체.*목차/i.test(userIntent)) {
    return true;
  }

  if (reply && /재구성|목차를.*(바꿨|변경|수정)|새.*목차|다시.*목차|구조화했습니다/i.test(reply)) {
    return true;
  }
  const docLike = suggested.filter((s) => !isInterviewQuestionTitle(s.title)).length;
  return docLike >= suggested.length * 0.6 && isInterviewQuestionToc(existing);
}

/** AI suggestedToc 적용 — 인터뷰 질문 목차는 새 문서 목차로 교체 */
export function applySuggestedToc(
  existing: TocSection[],
  suggested: TocSection[] | undefined,
  reply?: string,
  options?: { sessionStatus?: string; userMessage?: string }
): TocSection[] {
  if (!suggested || suggested.length === 0) {
    return repairTocSections(existing);
  }

  const docSections = filterDocumentTocSections(suggested);
  if (docSections.length === 0) {
    return repairTocSections(existing);
  }

  const effective = docSections;
  const hasEstablishedToc = existing.length > 0 && !isInterviewQuestionToc(existing);
  const explicitReplace = shouldReplaceTocEntirely(
    existing,
    effective,
    reply,
    options?.userMessage
  );

  if (hasEstablishedToc && !explicitReplace) {
    const tocUpdateRequested = userRequestsTocUpdate(options?.userMessage, reply);
    const additiveSections = hasNewTocSections(existing, effective);

    if (options?.sessionStatus === 'writing' || options?.sessionStatus === 'reviewing') {
      if (!tocUpdateRequested && !additiveSections) {
        return repairTocSections(existing);
      }
    }
  }

  if (explicitReplace) {
    return repairTocSections(
      effective.map((s) => ({
        ...s,
        content: '',
        feedback: '',
        status: 'pending' as const,
      }))
    );
  }

  return repairTocSections(mergeTocSections(existing, effective));
}

/** 집필 대상: 그룹 헤더(3.)가 아닌 실제 하위 섹션(3.1) 또는 자식 없는 상위 섹션 */
export function findNextWritableSection(toc: TocSection[]): TocSection | null {
  const normalized = normalizeTocSections(toc);
  const parentIds = new Set(normalized.filter((s) => s.parentId).map((s) => s.parentId));

  const writable = normalized.filter((sec) => {
    if (sec.isGroupHeader || parentIds.has(sec.id)) return false;
    return true;
  });

  return writable.find((s) => s.status !== 'completed') || null;
}

export function getWritableSections(toc: TocSection[]): TocSection[] {
  const normalized = normalizeTocSections(toc);
  const parentIds = new Set(normalized.filter((s) => s.parentId).map((s) => s.parentId));
  return normalized.filter((sec) => !sec.isGroupHeader && !parentIds.has(sec.id));
}

export function buildTocDisplayRows(toc: TocSection[]): TocDisplayRow[] {
  const normalized = normalizeTocSections(toc);
  const rows: TocDisplayRow[] = [];

  let parentIndex = 0;
  const parentNumById: Record<string, number> = {};
  const subIndexByParent: Record<string, number> = {};

  for (const sec of normalized) {
    const parsed = parseSectionNumber(sec.title);
    const isSub = Boolean(sec.parentId) || parsed.kind === 'child';
    let displayNumber = '';
    let parentId = sec.parentId;

    if (!isSub) {
      parentIndex++;
      parentNumById[sec.id] = parentIndex;
      displayNumber = `${parentIndex}`;
    } else if (parsed.kind === 'child' && parsed.parentNum && parsed.childNum) {
      displayNumber = `${parsed.parentNum}.${parsed.childNum}`;
      if (!parentId) {
        parentId = Object.entries(parentNumById).find(([, n]) => n === parsed.parentNum)?.[0];
      }
    } else if (parentId && parentNumById[parentId]) {
      const parentNum = parentNumById[parentId];
      subIndexByParent[parentId] = (subIndexByParent[parentId] || 0) + 1;
      displayNumber = `${parentNum}.${subIndexByParent[parentId]}`;
    } else {
      parentIndex++;
      displayNumber = `${parentIndex}`;
    }

    rows.push({
      id: sec.id,
      title: sec.title,
      displayNumber,
      displayTitle: stripLeadingNumber(sec.title),
      isSub,
      isGroupHeader: Boolean(sec.isGroupHeader),
      status: sec.status,
      originalSection: sec,
      parentId,
    });
  }

  return rows;
}

export function getSectionDisplayLabel(section: TocSection, toc: TocSection[]): string {
  const rows = buildTocDisplayRows(toc);
  const row = rows.find((r) => r.id === section.id);
  if (!row) return stripLeadingNumber(section.title);
  return formatSectionHeading(row);
}

/** 목차 번호 + 제목 (번호 중복 없음) */
export function formatSectionHeading(row: TocDisplayRow): string {
  return `${row.displayNumber}. ${row.displayTitle}`;
}

/**
 * 전체 위키를 목차 구조 그대로 마크다운 문서로 조립.
 * - 상위(1, 2, 3) → ##, 하위(1.1, 3.2) → ###
 * - 별도 1~N 순번 없음, 구분선(---) 없음 → MD 뷰어처럼 연속 문서
 */
export function buildFullWikiMarkdown(toc: TocSection[]): string {
  if (toc.length === 0) return '*아직 도출된 위키 문서가 없습니다.*';

  const rows = buildTocDisplayRows(toc);
  const blocks: string[] = ['# 기획 위키 문서', ''];

  for (const row of rows) {
    const sec = row.originalSection;
    const heading = formatSectionHeading(row);
    const mdLevel = row.isSub ? '###' : '##';

    if (row.isGroupHeader) {
      blocks.push(`${mdLevel} ${heading}`, '');
      if (sec.content?.trim()) {
        blocks.push(sanitizeDraftContent(sec.content), '');
      }
      continue;
    }

    const body = sec.content?.trim()
      ? sanitizeDraftContent(sec.content)
      : '*작성 대기 중인 섹션입니다. AI와 채팅을 통해 이 섹션을 채워 보세요.*';

    blocks.push(`${mdLevel} ${heading}`, '', body, '');
  }

  return blocks.join('\n').trimEnd() + '\n';
}

export function getChapterNumberForSection(sectionId: string, toc: TocSection[]): string | null {
  const rows = buildTocDisplayRows(toc);
  const row = rows.find((r) => r.id === sectionId);
  if (!row) return null;
  return row.displayNumber.split('.')[0];
}

export function getWritableSectionsInChapter(toc: TocSection[], chapterNum: string): TocSection[] {
  const rows = buildTocDisplayRows(toc);
  const idToRow = Object.fromEntries(rows.map((r) => [r.id, r]));
  return getWritableSections(toc).filter((sec) => {
    const row = idToRow[sec.id];
    return row && row.displayNumber.split('.')[0] === chapterNum;
  });
}

/** 해당 대목차의 소목차가 모두 completed인지 */
export function isChapterFullyConfirmed(toc: TocSection[], chapterNum: string): boolean {
  const inChapter = getWritableSectionsInChapter(toc, chapterNum);
  return inChapter.length > 0 && inChapter.every((s) => s.status === 'completed');
}

/** 방금 확정한 섹션으로 인해 대목차 집필이 막 끝났는지 */
export function isChapterJustCompleted(sectionId: string, toc: TocSection[]): boolean {
  const chapterNum = getChapterNumberForSection(sectionId, toc);
  if (!chapterNum) return false;
  return isChapterFullyConfirmed(toc, chapterNum);
}

/** 대목차 검토용 — 해당 장의 확정 본문만 */
export function buildChapterReviewMarkdown(toc: TocSection[], chapterNum: string): string {
  const sections = getWritableSectionsInChapter(toc, chapterNum).filter(
    (s) => s.status === 'completed' && s.content?.trim()
  );
  if (sections.length === 0) return '';

  const rows = buildTocDisplayRows(toc);
  const parentRow = rows.find((r) => !r.isSub && r.displayNumber === chapterNum);
  const chapterTitle = parentRow ? formatSectionHeading(parentRow) : `${chapterNum}.`;

  const blocks = [`# ${chapterTitle} (확정본 검토)`, ''];
  for (const sec of sections) {
    blocks.push(`## ${getSectionDisplayLabel(sec, toc)}`, '', sanitizeDraftContent(sec.content), '');
  }
  return blocks.join('\n').trim();
}

/** 전체 완료 검토용 — 확정된 집필 본문만 */
export function buildConfirmedContentMarkdown(toc: TocSection[]): string {
  const completed = getWritableSections(toc).filter(
    (s) => s.status === 'completed' && s.content?.trim()
  );
  if (completed.length === 0) return '';

  const blocks = ['# 확정된 기획서 전체 (검토용)', ''];
  for (const sec of completed) {
    blocks.push(`## ${getSectionDisplayLabel(sec, toc)}`, '', sanitizeDraftContent(sec.content), '');
  }
  return blocks.join('\n').trim();
}

/** reply 본문에서 목차 번호·제목 추출 (suggestedToc 누락 시 폴백) */
export function parseTocOutlineFromReply(reply: string): TocSection[] {
  if (!reply?.trim()) return [];

  const sections: TocSection[] = [];
  const seen = new Set<string>();

  const addSection = (num: string, rawTitle: string) => {
    const title = rawTitle.trim().replace(/^['"「『]|['"」』]$/g, '').trim();
    if (!title || seen.has(num) || isInterviewQuestionTitle(title) || isPollutedTocTitle(title)) return;
    if (title.length > 48) return;
    seen.add(num);
    const id = `sec_${num.replace(/\./g, '_')}`;
    const fullTitle = num.includes('.') ? `${num} ${title}` : `${num}. ${title}`;
    sections.push({
      id,
      title: fullTitle,
      status: 'pending',
      content: '',
      feedback: '',
    });
  };

  const arrowMatch = reply.match(/\[([^\]]+->[^\]]+)\]/);
  if (arrowMatch) {
    arrowMatch[1].split(/\s*->\s*/).forEach((part, idx) => {
      const cleaned = part.trim();
      if (cleaned) addSection(`1.${idx + 1}`, cleaned);
    });
  }

  for (const line of reply.split('\n')) {
    if (line.includes('->')) {
      line.split(/\s*->\s*/).forEach((part, idx) => {
        const cleaned = part.trim().replace(/^[\[\(]|[\]\)]$/g, '');
        if (cleaned && !cleaned.includes('->')) addSection(`1.${idx + 1}`, cleaned);
      });
    }
  }

  for (const line of reply.split('\n')) {
    const trimmed = line.trim();
    const lineMatch = trimmed.match(/^(?:[-*•]\s*)?(\d+(?:\.\d+)?)\.?\s+(.+)$/);
    if (lineMatch) addSection(lineMatch[1], lineMatch[2]);
  }

  for (const m of reply.matchAll(/['「『]?(\d+\.\d+)\s+([^'」』\n,.:;]+)['」』]?/g)) {
    addSection(m[1], m[2]);
  }

  return sections;
}
