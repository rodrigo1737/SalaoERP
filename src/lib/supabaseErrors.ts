type ErrorPayload = {
  error?: string;
  message?: string;
  msg?: string;
  details?: string;
  hint?: string;
};

const stringifyPayload = (payload: unknown): string | null => {
  if (!payload) return null;

  if (typeof payload === 'string') return payload;

  if (typeof payload === 'object') {
    const data = payload as ErrorPayload;
    const message = data.error || data.message || data.msg;
    const extras = [data.details, data.hint].filter(Boolean);

    if (message && extras.length > 0) return `${message} (${extras.join(' ')})`;
    if (message) return message;
  }

  return null;
};

export const getSupabaseErrorMessage = async (
  error: unknown,
  data?: unknown,
  fallback = 'Erro inesperado',
): Promise<string> => {
  const dataMessage = stringifyPayload(data);
  if (dataMessage) return dataMessage;

  const maybeError = error as { message?: string; context?: Response };

  if (maybeError?.context) {
    try {
      const contentType = maybeError.context.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await maybeError.context.clone().json();
        const contextMessage = stringifyPayload(payload);
        if (contextMessage) return contextMessage;
      }

      const text = await maybeError.context.clone().text();
      if (text) return text;
    } catch {
      // Fall back to the message below.
    }
  }

  if (maybeError?.message) return maybeError.message;
  return fallback;
};
