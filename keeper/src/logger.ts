// Minimal structured (JSON lines) logger. No dependencies.
// Never pass secrets to it; as a second line of defence, any field whose name looks
// like a secret is redacted and 32-byte hex strings in secret-ish fields are masked.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /(private|secret|mnemonic|password|apikey|api_key|pk$)/i;

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

function replacer(key: string, value: unknown): unknown {
  if (key && SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, ...(value as unknown as Record<string, unknown>) };
  }
  return value;
}

export function createLogger(
  level: LogLevel = "info",
  base: Record<string, unknown> = {},
  sink: (line: string) => void = (l) => process.stdout.write(l + "\n"),
): Logger {
  const min = LEVELS[level];
  const write = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[lvl] < min) return;
    const entry = { ts: new Date().toISOString(), level: lvl, msg, ...base, ...fields };
    let line: string;
    try {
      line = JSON.stringify(entry, replacer);
    } catch {
      line = JSON.stringify({ ts: entry.ts, level: lvl, msg, note: "unserializable fields" });
    }
    sink(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger(level, { ...base, ...fields }, sink),
  };
}

/** Logger that drops everything (tests). */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};

/** Short, log-safe description of an error (viem errors carry huge `details`). */
export function errorInfo(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as { name?: string; shortMessage?: string; message?: string };
    return { errorName: e.name, error: e.shortMessage ?? e.message?.split("\n")[0] };
  }
  return { error: String(err) };
}
