export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export interface LogEntry {
  timestamp: Date;
  level: Level;
  source: string;
  message: string;
}

const LINE_PATTERN = /^(\S+ \S+) \[(\w+)\] (\S+): (.*)$/;
const LEVEL_ORDER: Level[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

/** Parses "2024-01-01 12:00:00" into a Date. */
export function parseTimestamp(raw: string): Date {
  return new Date(raw.replace(" ", "T") + "Z");
}

/** Parses one log line, or returns null if it doesn't match. */
export function parseLogLine(line: string): LogEntry | null {
  const m = LINE_PATTERN.exec(line);
  if (!m) return null;
  const [, ts, level, source, message] = m;
  if (!LEVEL_ORDER.includes(level as Level)) return null;
  return { timestamp: parseTimestamp(ts), level: level as Level, source, message };
}

/** Parses a whole log file, dropping lines that don't match. */
export function parseLog(text: string): LogEntry[] {
  return text
    .split("\n")
    .map(parseLogLine)
    .filter((e): e is LogEntry => e !== null);
}

/** Counts entries per level. */
export function countByLevel(entries: LogEntry[]): Map<Level, number> {
  const counts = new Map<Level, number>();
  for (const { level } of entries) {
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return counts;
}

/** Keeps entries at or above the given severity. */
export function filterBySeverity(entries: LogEntry[], min: Level): LogEntry[] {
  const floor = LEVEL_ORDER.indexOf(min);
  return entries.filter((e) => LEVEL_ORDER.indexOf(e.level) >= floor);
}

/** Replaces numbers and ids so similar messages group together. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .trim();
}

/** Returns the most frequent normalized messages. */
export function topRecurringMessages(entries: LogEntry[], limit = 5): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = normalizeMessage(e.message);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

/** Counts ERROR and FATAL entries per source service. */
export function errorsBySource(entries: LogEntry[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const e of filterBySeverity(entries, "ERROR")) {
    result.set(e.source, (result.get(e.source) ?? 0) + 1);
  }
  return result;
}

/** Finds windows of `windowMs` holding at least `threshold` entries. */
export function findBursts(
  entries: LogEntry[],
  windowMs: number,
  threshold: number,
): Array<{ start: Date; count: number }> {
  const sorted = [...entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const bursts: Array<{ start: Date; count: number }> = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end].timestamp.getTime() - sorted[start].timestamp.getTime() > windowMs) {
      start++;
    }
    if (end - start + 1 >= threshold) {
      bursts.push({ start: sorted[start].timestamp, count: end - start + 1 });
      start = end + 1;
    }
  }
  return bursts;
}

/** Formats a millisecond duration as a compact string, e.g. "1h 2m 3s". */
export function formatDuration(ms: number): string {
  const units: [string, number][] = [["h", 3_600_000], ["m", 60_000], ["s", 1000]];
  const parts: string[] = [];
  let remaining = ms;
  for (const [label, size] of units) {
    const value = Math.floor(remaining / size);
    remaining -= value * size;
    if (value > 0) parts.push(`${value}${label}`);
  }
  return parts.length ? parts.join(" ") : `${Math.round(ms)}ms`;
}

/** Produces a human-readable summary report for a raw log file. */
export function summariseLog(text: string): string {
  const entries = parseLog(text);
  if (entries.length === 0) return "No log entries found.";
  const first = entries[0].timestamp;
  const last = entries[entries.length - 1].timestamp;
  const lines: string[] = [
    `Entries: ${entries.length} over ${formatDuration(last.getTime() - first.getTime())}`,
    `Levels: ${[...countByLevel(entries)].map(([l, n]) => `${l}=${n}`).join(", ")}`,
  ];
  const errors = [...errorsBySource(entries)].sort((a, b) => b[1] - a[1]);
  if (errors.length) {
    lines.push("Errors by source:");
    for (const [source, count] of errors) lines.push(`  ${source}: ${count}`);
  }
  lines.push("Most common messages:");
  for (const [message, count] of topRecurringMessages(entries, 3)) {
    lines.push(`  ${count}× ${message}`);
  }
  const bursts = findBursts(entries, 60_000, 20);
  for (const b of bursts) {
    lines.push(`Burst: ${b.count} entries within 1 minute starting ${b.start.toISOString()}`);
  }
  return lines.join("\n");
}
