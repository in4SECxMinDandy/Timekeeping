import type { ApiErrorShape } from './types';

export class HttpError extends Error {
  status: number;
  code: string;
  field?: string;
  extra: Record<string, unknown>;

  constructor(status: number, body: ApiErrorShape | null, fallback: string) {
    super(body?.message || fallback);
    this.name = 'HttpError';
    this.status = status;
    this.code = body?.code || 'HTTP_ERROR';
    this.field = body?.field;
    const { code: _code, message: _message, field: _field, ...rest } = body ?? {};
    this.extra = rest as Record<string, unknown>;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HttpError(0, null, 'Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.');
  }
  if (!res.ok) {
    let data: ApiErrorShape | null = null;
    try {
      data = (await res.json()) as ApiErrorShape;
    } catch {
      data = null;
    }
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('cc:unauthorized'));
    }
    throw new HttpError(res.status, data, `Yêu cầu thất bại (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorText(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Đã có lỗi xảy ra.';
}
