/**
 * Extract a human-readable message from an unknown catch value.
 * Use with `catch (error: unknown)` instead of `catch (error: any)`,
 * which allowed unchecked `.message` access on values that may not be Errors.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
