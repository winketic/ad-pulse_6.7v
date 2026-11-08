const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 } as const;
export type LogLevel = keyof typeof LEVELS;

const configured = (process.env.LOG_LEVEL ?? "info").trim() as LogLevel;
const threshold = LEVELS[configured] ?? LEVELS.info;

function emit(level: LogLevel, scope: string, msg: string, extra?: unknown) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  if (extra === undefined) out(line);
  else out(line, extra);
}

export function logger(scope: string) {
  return {
    trace: (m: string, e?: unknown) => emit("trace", scope, m, e),
    debug: (m: string, e?: unknown) => emit("debug", scope, m, e),
    info: (m: string, e?: unknown) => emit("info", scope, m, e),
    warn: (m: string, e?: unknown) => emit("warn", scope, m, e),
    error: (m: string, e?: unknown) => emit("error", scope, m, e),
  };
}
