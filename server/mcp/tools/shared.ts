// Shared helpers for MCP tool modules that wrap services returning plain
// values/throwing exceptions (as opposed to freebox.ts's uniform
// {success, result, error_code, msg} envelope, which has its own toToolResult).

export async function wrapAsync(fn: () => Promise<unknown> | unknown) {
  try {
    const result = await fn();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ success: true, result }, null, 2) },
      ],
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) },
      ],
      isError: true,
    };
  }
}
