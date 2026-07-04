/** 집필 초안에 섞일 수 있는 AI 메타 문구 제거 */
export function sanitizeDraftContent(content: string): string {
  if (!content?.trim()) return '';

  let text = content.trim();

  const leadingPatterns = [
    /^다음은?.{0,30}초안입니다[.:：]?\s*/i,
    /^아래는?.{0,30}초안입니다[.:：]?\s*/i,
    /^#{1,3}\s*(초안|집필\s*초안)\s*\n+/i,
    /^---\s*\n+/,
  ];
  for (const pattern of leadingPatterns) {
    text = text.replace(pattern, '');
  }

  const trailingPatterns = [
    /\n+---\s*\n+[\s\S]*$/,
    /\n+\*?이상으로[\s\S]*초안[\s\S]*$/i,
    /\n+\*?위 내용[\s\S]*확인[\s\S]*$/i,
  ];
  for (const pattern of trailingPatterns) {
    text = text.replace(pattern, '');
  }

  return text.trim();
}

/** 대화창에 표시할 AI 응답 (설명·비평·피드백 수용·반박 등) */
export function buildModelChatText(reply?: string, critique?: string): string {
  const parts: string[] = [];

  if (reply?.trim()) {
    parts.push(reply.trim());
  }

  if (critique?.trim()) {
    const critiqueText = critique.trim();
    const replyText = parts[0] || '';
    if (!replyText.includes(critiqueText.slice(0, Math.min(50, critiqueText.length)))) {
      parts.push(`\n\n**[비평 및 코멘트]**\n${critiqueText}`);
    }
  }

  if (parts.length > 0) {
    return parts.join('');
  }

  return '';
}

/** JSON 파싱 실패 시 suggestedToc 배열만 추출 */
export function extractSuggestedTocFromJsonBuffer(buffer: string): Array<Record<string, unknown>> | null {
  const keyIdx = buffer.indexOf('"suggestedToc"');
  if (keyIdx === -1) return null;

  const arrayStart = buffer.indexOf('[', keyIdx);
  if (arrayStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart; i < buffer.length; i++) {
    const char = buffer[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(buffer.substring(arrayStart, i + 1));
          return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function shouldRequestTocFromAi(data: {
  reply?: string;
  suggestedToc?: unknown[];
  sessionStatus?: string;
  updatedContent?: string;
}): boolean {
  if (data.suggestedToc?.length) return false;
  const reply = data.reply || '';
  return (
    data.sessionStatus === 'writing' ||
    !!data.updatedContent ||
    /목차|1\.1|집필|작성을 시작|마크다운.*정리|표준 가이드/i.test(reply)
  );
}

export const TOC_JSON_FOLLOWUP_PROMPT =
  '[시스템] 방금 목차를 제안했지만 suggestedToc JSON이 비어 있습니다. 지금 반드시 suggestedToc 배열 전체(id, title, status 포함)를 JSON으로 보내 주세요. reply는 한 줄 안내만. sessionStatus는 "writing". 첫 소목차 id를 currentSectionId로 설정하세요.';
