import { execSync } from "node:child_process";

export function hasCommand(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

interface WaitForOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
  /** Human-readable description of what is being awaited, shown in timeout errors. */
  label?: string;
}

export async function waitFor<T>(
  probe: () => Promise<T>,
  isReady: (value: T) => boolean,
  options: WaitForOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const retryDelayMs = options.retryDelayMs ?? 100;
  const label = options.label ?? "readiness";
  const deadline = Date.now() + timeoutMs;

  let lastValue = await probe();
  while (true) {
    if (isReady(lastValue)) return lastValue;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    await new Promise((resolve) => setTimeout(resolve, Math.min(retryDelayMs, remainingMs)));
    lastValue = await probe();
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label}; last value: ${describeValue(lastValue)}`,
  );
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `Array(len=${value.length})`;
  if (typeof value === "string") {
    const trimmed = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    return JSON.stringify(trimmed);
  }
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json.length > 120 ? `${json.slice(0, 120)}…` : json;
    } catch {
      return "[unserializable object]";
    }
  }
  return String(value);
}
