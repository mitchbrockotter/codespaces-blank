export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

export type ApiUser = {
  id: number;
  tenantId: number;
  email: string;
  role: "ADMIN" | "USER";
};

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = options.body instanceof FormData ? options.headers ?? {} : {
    "Content-Type": "application/json",
    ...(options.headers ?? {})
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const data = await res
    .json()
    .catch(() => ({}));

  if (!res.ok) {
    const message = (data as { error?: string }).error || "Request failed";
    throw new Error(message);
  }

  return data as T;
}
