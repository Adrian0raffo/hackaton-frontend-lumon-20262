const baseUrl = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = {
  error?: string;
  message?: string;
  details?: unknown;
};

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    accessToken?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!baseUrl) {
    throw new Error("Falta configurar VITE_API_BASE_URL.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    signal: options.signal,
    headers: {
      "X-Lumon-Build": __BUILD_SHA__,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE", "Lumon envió una respuesta inválida.", null);
  }

  if (!response.ok) {
    const error = data as ErrorBody | null;
    throw new ApiError(
      response.status,
      error?.error ?? "REQUEST_FAILED",
      error?.message ?? "No se pudo completar la solicitud.",
      error?.details ?? null,
    );
  }

  return data as T;
}
