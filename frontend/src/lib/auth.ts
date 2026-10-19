import { apiFetch } from "./api";
export type User = { id: string; email: string; name: string; role: "USER" | "ADMIN" };
export function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(`auth/${path}`, { ...options, credentials: "include", cache: "no-store" });
}
