export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class SatClient {
  constructor(private readonly base = '/api/v1') {}

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const token =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sat.supabase') : null;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const response = await fetch(`${this.base}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data?.error?.code || 'HTTP',
        data?.error?.message || 'Request failed',
        data?.error?.details,
      );
    }
    return data as T;
  }

  me() {
    return this.request<Me>('GET', '/me');
  }

  login(body: { email: string; password: string }) {
    return this.request<LoginResult>('POST', '/auth/login', body);
  }

  register(body: { email: string; password: string; displayName: string }) {
    return this.request<{ id: string; verificationToken: string | null }>(
      'POST',
      '/auth/register',
      body,
    );
  }

  verify(token: string) {
    return this.request('POST', '/auth/verify-email', { token });
  }

  forgot(email: string) {
    return this.request<{ resetToken: string | null }>('POST', '/auth/forgot-password', { email });
  }

  reset(token: string, password: string) {
    return this.request('POST', '/auth/reset-password', { token, password });
  }

  logout() {
    return this.request('POST', '/auth/logout');
  }
}

export interface Me {
  id: string;
  email: string;
  displayName: string;
  role: 'contributor' | 'admin';
  status: string;
  emailVerified: boolean;
  termsAccepted: boolean;
  profile: { contactMethod: string; contactValue: string; leaderboardOptIn: boolean } | null;
}

export interface LoginResult {
  token: string;
  user: { id: string; role: string; displayName: string; emailVerified: boolean };
}

export const api = new SatClient();

export function idempotencyHeaders() {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

export function baht(satang: number) {
  return `฿${(satang / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
