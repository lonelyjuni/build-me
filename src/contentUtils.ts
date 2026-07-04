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
