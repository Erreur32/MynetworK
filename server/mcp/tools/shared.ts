// Shared helpers for MCP tool modules that wrap services returning plain
// values/throwing exceptions (as opposed to freebox.ts's uniform
// {success, result, error_code, msg} envelope, which has its own toToolResult).
import { z } from "zod";

// Compact JSON on purpose: tool results are read by LLMs (some local, with small
// context windows), indentation alone costs ~25% of the payload.
export function textResult(payload: unknown, isError: boolean) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError,
  };
}

export async function wrapAsync(fn: () => Promise<unknown> | unknown) {
  try {
    const result = await fn();
    if (result instanceof ListResult) return listToolResult(result);
    return textResult({ success: true, result }, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return textResult({ success: false, error: message }, true);
  }
}

// A filtered/truncated list: `total` (matches before `limit`) is added next to
// `result` in the envelope, so the caller can tell when items were cut off.
export class ListResult {
  constructor(
    readonly items: unknown[],
    readonly total: number,
  ) {}
}

// Same {success, result} envelope, plus `total` (matches before limit).
export function listToolResult(list: ListResult) {
  return textResult({ success: true, result: list.items, total: list.total }, false);
}

// Common inputSchema fields for list tools.
export const MAX_SEARCH_LENGTH = 200;
export const searchParam = z
  .string()
  .max(MAX_SEARCH_LENGTH)
  .optional()
  .describe("Case-insensitive substring match on name/hostname, IP or MAC address");
export const rawParam = z
  .boolean()
  .optional()
  .describe("Return the full raw objects instead of the compact summary (large, for debugging only)");

export function limitParam(defaultLimit?: number) {
  const hint = defaultLimit ? `default ${defaultLimit}` : "default: no limit";
  return z.number().int().positive().max(1000).optional().describe(`Max number of items to return (${hint})`);
}

export function matchesSearch(search: string | undefined, ...values: unknown[]): boolean {
  if (!search) return true;
  const needle = search.trim().toLowerCase();
  return values.some((v) => v !== undefined && v !== null && String(v).toLowerCase().includes(needle));
}

export interface ListOptions<T> {
  filter?: (item: T) => boolean;
  limit?: number;
  project?: (item: T) => unknown;
}

// Filter, count, truncate, then project only the kept items.
export function toListResult<T>(items: T[], options: ListOptions<T>): ListResult {
  const matched = options.filter ? items.filter(options.filter) : items;
  const kept = options.limit ? matched.slice(0, options.limit) : matched;
  return new ListResult(options.project ? kept.map(options.project) : kept, matched.length);
}
