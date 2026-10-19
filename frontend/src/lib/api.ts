export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code?: string,
  ) {
    super(`API request failed: ${status}`);
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const timeout = AbortSignal.timeout(10_000);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const response = await fetch(
    `${API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
    { ...options, signal },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
