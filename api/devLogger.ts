import fs from "fs";
import path from "path";

export type DevLogLevel = "debug" | "info" | "warn" | "error";

export interface DevLogEntry {
  ts: string;
  level: DevLogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_DIR = path.join(process.cwd(), "logs");

/** 로컬 개발 시 파일 로깅 (Vercel 프로덕션에서는 기본 꺼짐) */
export function isDevLoggingEnabled(): boolean {
  if (process.env.BUILDME_DEV_LOG === "0") return false;
  if (process.env.BUILDME_DEV_LOG === "1") return true;
  return !process.env.VERCEL && process.env.NODE_ENV !== "production";
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logFilePathForToday(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `buildme-${day}.log`);
}

function truncate(value: unknown, max = 4000): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… [truncated ${value.length - max} chars]`;
}

function sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (key.toLowerCase().includes("apikey") || key.toLowerCase().includes("password")) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = truncate(val);
  }
  return out;
}

export function devLog(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: DevLogLevel = "info"
) {
  const entry: DevLogEntry = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
    data: sanitizeData(data),
  };

  const line = JSON.stringify(entry);

  if (isDevLoggingEnabled()) {
    try {
      ensureLogDir();
      fs.appendFileSync(logFilePathForToday(), `${line}\n`, "utf8");
    } catch (err) {
      console.error("[devLogger] failed to write log file:", err);
    }
  }

  const prefix = `[BuildMe:${category}]`;
  if (level === "error") console.error(prefix, message, entry.data ?? "");
  else if (level === "warn") console.warn(prefix, message, entry.data ?? "");
  else console.log(prefix, message, entry.data ?? "");
}

export function getDevLogDir(): string {
  return LOG_DIR;
}

export function readRecentDevLogs(limit = 80): DevLogEntry[] {
  if (!isDevLoggingEnabled()) return [];
  ensureLogDir();
  const file = logFilePathForToday();
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  const tail = lines.slice(-limit);
  const entries: DevLogEntry[] = [];
  for (const line of tail) {
    try {
      entries.push(JSON.parse(line) as DevLogEntry);
    } catch {
      entries.push({
        ts: new Date().toISOString(),
        level: "warn",
        category: "devLogger",
        message: "Unparseable log line",
        data: { line: truncate(line, 500) as string },
      });
    }
  }
  return entries;
}
