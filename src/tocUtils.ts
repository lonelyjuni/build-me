import { TocSection } from './types';

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

  const merged = normalizedSuggested.map((s) => {
    const old = existingById[s.id] || existingByTitle[stripLeadingNumber(s.title).toLowerCase()];
    if (!old) return s;
    return {
      ...s,
      id: old.id,
      content: s.content || old.content,
      feedback: s.feedback || old.feedback,
      status: old.status === 'completed' ? 'completed' : (s.status || old.status),
    };
  });

  for (const old of existing) {
    if (old.status === 'completed' && !merged.some((m) => m.id === old.id)) {
      merged.push(old);
    }
  }

  return normalizeTocSections(merged);
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
  if (!row) return section.title;
  return `${row.displayNumber}. ${row.displayTitle}`;
}
