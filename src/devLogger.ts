type ClientLogLevel = "debug" | "info" | "warn" | "error";

/** 브라우저 → 로컬 서버 로그 (개발 모드에서만) */
export function clientDevLog(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: ClientLogLevel = "info"
) {
  if (!import.meta.env.DEV) return;

  const payload = { category, message, data, level };

  fetch("/api/dev/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // 로깅 실패는 앱 동작에 영향 주지 않음
  });
}
