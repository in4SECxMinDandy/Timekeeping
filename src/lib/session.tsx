import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, errorText } from './api';
import { deviceId, deviceLabel } from './device';
import type { Company, LoginResponse, MeResponse, Settings } from './types';

interface AuthValue {
  status: 'loading' | 'anon' | 'authed';
  me: MeResponse | null;
  login: (input: {
    companyCode: string;
    email: string;
    pin: string;
    surface: 'admin' | 'employee';
    label?: string;
  }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  applyCompany: (company: Company, settings?: Settings) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>('/api/auth/me');
      setMe(data);
      setStatus('authed');
    } catch {
      setMe(null);
      setStatus('anon');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setMe(null);
      setStatus('anon');
    };
    window.addEventListener('cc:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cc:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    const company = me?.company;
    if (!company) return;
    document.documentElement.style.setProperty('--tenant', company.brandColor);
    document.documentElement.style.setProperty('--brand', company.brandColor);
    if (company.appName) document.title = `${company.appName} · ${company.name}`;
  }, [me?.company]);

  const login = useCallback<AuthValue['login']>(async (input) => {
    try {
      const data = await api.post<LoginResponse>('/api/auth/login', {
        companyCode: input.companyCode,
        email: input.email,
        pin: input.pin,
        deviceId: deviceId(),
        deviceLabel: input.label || deviceLabel(),
        surface: input.surface,
      });
      setMe(data);
      setStatus('authed');
      return data;
    } catch (err) {
      throw new Error(errorText(err));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setMe(null);
      setStatus('anon');
    }
  }, []);

  const applyCompany = useCallback((company: Company, settings?: Settings) => {
    setMe((prev) => (prev ? { ...prev, company, ...(settings ? { settings } : {}) } : prev));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, me, login, logout, refresh, applyCompany }),
    [status, me, login, logout, refresh, applyCompany],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function canUseAdmin(role?: string): boolean {
  return role === 'admin' || role === 'hr' || role === 'manager';
}
