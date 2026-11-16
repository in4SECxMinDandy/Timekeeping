import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Employee, Role } from '../shared/types';
import { getDb } from './store';

const SESSION_COOKIE = 'cc_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Session {
  employeeId: string;
  deviceId: string;
  expiresAt: number;
}

export const sessions = new Map<string, Session>();
const attempts = new Map<string, { count: number; firstAt: number }>();

export function hashPin(pin: string, salt?: string): { pinHash: string; pinSalt: string } {
  const pinSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const pinHash = crypto.scryptSync(pin, pinSalt, 64).toString('hex');
  return { pinHash, pinSalt };
}

export function verifyPin(pin: string, employee: Employee): boolean {
  if (!employee.pinHash || !employee.pinSalt) return false;
  const candidate = crypto.scryptSync(pin, employee.pinSalt, 64);
  const stored = Buffer.from(employee.pinHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

export function createPin(): string {
  return String(crypto.randomInt(1000, 9999));
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionToken(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

export function startSession(res: Response, employeeId: string, deviceId: string): void {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { employeeId, deviceId, expiresAt: Date.now() + SESSION_TTL_MS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function endSession(req: Request, res: Response): void {
  const token = sessionToken(req);
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export interface AuthedRequest extends Request {
  employee?: Employee;
  sessionDevice?: string;
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = sessionToken(req);
  if (!token) {
    res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' });
    return;
  }
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Phiên đăng nhập đã hết hạn.' });
    return;
  }
  getDb()
    .then((db) => {
      const employee = db.employees.find((e) => e.id === session.employeeId);
      if (!employee || employee.status !== 'active') {
        sessions.delete(token);
        res.status(401).json({ code: 'ACCOUNT_INACTIVE', message: 'Tài khoản không còn hoạt động.' });
        return;
      }
      if (employee.deviceId && employee.deviceId !== session.deviceId) {
        sessions.delete(token);
        res.status(423).json({
          code: 'DEVICE_LOCKED',
          message: 'Tài khoản đã được mở khoá trên thiết bị khác. Liên hệ quản trị viên.',
        });
        return;
      }
      req.employee = employee;
      req.sessionDevice = session.deviceId;
      next();
    })
    .catch(next);
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.employee || !roles.includes(req.employee.role)) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' });
      return;
    }
    next();
  };
}

export function rateLimitKey(companyCode: string, email: string): string {
  return `${companyCode.toLowerCase()}:${email.toLowerCase()}`;
}

export function checkRateLimit(key: string): { blocked: boolean; retryAfter?: number } {
  const entry = attempts.get(key);
  if (!entry) return { blocked: false };
  if (Date.now() - entry.firstAt > 5 * 60_000) {
    attempts.delete(key);
    return { blocked: false };
  }
  if (entry.count >= 5) {
    return { blocked: true, retryAfter: Math.ceil((entry.firstAt + 5 * 60_000 - Date.now()) / 1000) };
  }
  return { blocked: false };
}

export function noteFailedLogin(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > 5 * 60_000) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearFailedLogins(key: string): void {
  attempts.delete(key);
}

export function sanitizeEmployee(e: Employee) {
  const { pinHash: _pinHash, pinSalt: _pinSalt, ...rest } = e;
  return rest;
}

export function canManage(actor: Employee, target: Employee, all: Employee[]): boolean {
  if (actor.role === 'admin' || actor.role === 'hr') return true;
  if (actor.role === 'manager') {
    if (target.id === actor.id) return true;
    let cur = target;
    for (let guard = 0; cur.managerId && guard < 20; guard++) {
      if (cur.managerId === actor.id) return true;
      const next = all.find((e) => e.id === cur.managerId);
      if (!next) break;
      cur = next;
    }
    return false;
  }
  return actor.id === target.id;
}

export function canAdmin(role: Role): boolean {
  return role === 'admin' || role === 'hr' || role === 'manager';
}
