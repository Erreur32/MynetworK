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

/**
 * User-facing message for a failed request: dedicated messages for dropped connections and
 * timeouts, otherwise the API error message, the raw error message, or the fallback.
 */
export function getRequestErrorMessage(
    error: unknown,
    messages: { fallback: string; connection: string; timeout: string }
): string {
    const message = getErrorMessage(error);
    const apiMessage = getApiErrorPayload(error).error?.message;
    if (message.includes('socket') || message.includes('ended') || message.includes('ECONNRESET')) {
        return messages.connection;
    }
    if (message.includes('timeout') || message.includes('TIMEOUT')) {
        return messages.timeout;
    }
    return apiMessage || message || messages.fallback;
}
