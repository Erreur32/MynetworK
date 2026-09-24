/**
 * Message of an unknown catch value, for use with `catch (error: unknown)` instead of
 * `catch (error: any)`. Unlike server/utils/errorMessage.ts, returns '' when the value
 * isn't an Error, so `getErrorMessage(e) || fallback` keeps showing the fallback exactly
 * like the old `e.message || fallback` did (never "[object Object]" in the UI).
 */
export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '';
}

type ApiErrorPayload = {
    code?: string;
    error?: { message?: string; code?: string };
    response?: { data?: { error?: { message?: string } } };
};

/**
 * Structured API error fields a caught value may carry (`{ error: { message, code } }`, possibly
 * nested under `response.data`), or an empty object when it's not an object at all.
 */
export function getApiErrorPayload(error: unknown): ApiErrorPayload {
    return typeof error === 'object' && error !== null ? (error as ApiErrorPayload) : {};
}
