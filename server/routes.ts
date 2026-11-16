import crypto from 'node:crypto';
import express from 'express';
import type { Response } from 'express';
import type {
  Allowance,
  Db,
  DayOverride,
  Employee,
  Holiday,
  Location,
  Position,
  Request,
  RequestPayload,
  Role,
  Settings,
  Shift,
  Tier,
} from '../shared/types';
import {
  addDays,
  daySymbol,
  DAY_STATUS_LABEL,
  dowOf,
  eachDate,
  fmtDateVN,
  fmtMoney,
  fmtPeriodVN,
  hmToMinutes,
  ictParts,
  isValidDate,
  isValidHm,
  isValidPeriod,
  leaveTypeLabel,
  minutesToHm,
  monthRange,
  nowIctIso,
  overlappingLeave,
  partyTime,
  periodOf,
  requestDuration,
  shiftBounds,
  todayIct,
  usedAnnualLeave,
  validateRequestPayload,
} from '../shared/domain';
import {
  authMiddleware,
  canAdmin,
  checkRateLimit,
  clearFailedLogins,
  createPin,
  endSession,
  hashPin,
  noteFailedLogin,
  rateLimitKey,
  requireRole,
  sanitizeEmployee,
  sessions,
  startSession,
  verifyPin,
  type AuthedRequest,
} from './auth';
import type { AdminTask } from './service';
import {
  buildDay,
  buildMonth,
  effectiveSchedule,
  haversine,
  leaveBalance,
  locationOf,
  nearestLocation,
  payrollRows,
  positionOf,
  publishedPayroll,
  resolvePunchTarget,
  shiftOf,
} from './compute';
import {
  adminEmployeeSummary,
  buildTasks,
  dispatchData,
  employeeDetail,
  employeeHome,
  employeePayslips,
  employeeRequests,
  employeeScheduleData,
  employeeTimesheet,
  notify,
  payrollData,
  publishPayroll,
  requestLabel,
  revokePayroll,
  scheduleData,
  timesheetData,
  visibleEmployees,
  workbenchData,
} from './service';
import { getDb, mutate, resetDb, savePhoto } from './store';
import { sendXls } from './export';
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from './errors';

const nid = (prefix: string) => `${prefix}${crypto.randomBytes(6).toString('hex')}`;
const qstr = (v: unknown): string => (typeof v === 'string' ? v : '');
const asInt = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};
const asNum = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const text = (v: unknown, max = 300): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const mustText = (v: unknown, label: string, min = 1, max = 200): string => {
  const s = text(v, max);
  if (s.length < min) throw badRequest(`${label} không hợp lệ.`);
  return s;
};
const bool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;
const validRole = (v: unknown): Role =>
  v === 'admin' || v === 'hr' || v === 'manager' || v === 'employee'
    ? v
    : 'employee';
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const param = (req: { params: Record<string, unknown> }, name: string): string => {
  const v = req.params[name];
  if (Array.isArray(v)) return String(v[0] ?? '');
  return v === undefined ? '' : String(v);
};

export const api = express.Router();

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

api.post('/auth/login', async (req, res) => {
  const companyCode = text(req.body?.companyCode, 30).toUpperCase();
  const email = text(req.body?.email, 120).toLowerCase();
  const pin = text(req.body?.pin, 12);
  const deviceId = mustText(req.body?.deviceId, 'Mã thiết bị', 1, 120);
  const deviceLabel = text(req.body?.deviceLabel, 80) || 'Thiết bị không tên';
  const surface = req.body?.surface === 'admin' ? 'admin' : 'employee';
  if (!companyCode || !email || !pin) {
    throw badRequest('Vui lòng nhập mã công ty, email và mã PIN.');
  }
  if (!/^\d{4,8}$/.test(pin)) throw badRequest('Mã PIN gồm 4–8 chữ số.', 'pin');
  const key = rateLimitKey(companyCode, email);
  const limited = checkRateLimit(key);
  if (limited.blocked) {
    res.setHeader('Retry-After', String(limited.retryAfter ?? 300));
    throw new ApiError(429, 'RATE_LIMITED', 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 5 phút.');
  }
  const db = await getDb();
  const employee = db.employees.find(
    (e) => e.email.toLowerCase() === email && e.status === 'active',
  );
  if (
    db.company.code.toUpperCase() !== companyCode ||
    !employee ||
    !verifyPin(pin, employee)
  ) {
    noteFailedLogin(key);
    throw unauthorized('Mã công ty, email hoặc PIN không đúng.');
  }
  if (surface === 'admin' && !canAdmin(employee.role)) {
    throw forbidden('Tài khoản này không có quyền vào trang quản trị.');
  }
  if (employee.deviceId && employee.deviceId !== deviceId) {
    throw new ApiError(
      423,
      'DEVICE_LOCKED',
      `Tài khoản đang được khoá trên ${employee.deviceLabel || 'một thiết bị khác'}. Nhờ quản trị viên mở khoá.`,
    );
  }
  if (!employee.deviceId) {
    await mutate((d) => {
      const e = d.employees.find((x) => x.id === employee.id);
      if (e) {
        e.deviceId = deviceId;
        e.deviceLabel = deviceLabel;
      }
    });
  }
  clearFailedLogins(key);
  const latest = (await getDb()).employees.find((e) => e.id === employee.id) ?? employee;
  startSession(res, employee.id, deviceId);
  res.json({
    employee: sanitizeEmployee(latest),
    company: db.company,
    settings: db.settings,
    position: positionOf(db, latest),
    redirect: surface === 'admin' ? '/app/' : '/m/',
  });
});

api.post('/auth/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

api.get('/auth/me', authMiddleware, async (req: AuthedRequest, res) => {
  const db = await getDb();
  const employee = db.employees.find((e) => e.id === req.employee!.id)!;
  res.json({
    employee: sanitizeEmployee(employee),
    company: db.company,
    settings: db.settings,
    position: positionOf(db, employee),
  });
});

api.get('/health', async (_req, res) => {
  res.json({ ok: true, date: todayIct(), time: ictParts().time });
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

const admin = express.Router();
admin.use(authMiddleware, requireRole('admin', 'hr', 'manager'));
const setupOnly = requireRole('admin', 'hr');

function employeeOrThrow(db: Db, id: string): Employee {
  const employee = db.employees.find((e) => e.id === id);
  if (!employee) throw notFound('Không tìm thấy nhân viên.');
  return employee;
}

function assertVisible(actor: Employee, db: Db, employeeId: string): Employee {
  const visible = visibleEmployees(actor, db.employees);
  const employee = visible.find((e) => e.id === employeeId);
  if (!employee) throw notFound('Không tìm thấy nhân viên trong phạm vi quản lý.');
  return employee;
}

admin.get('/workbench', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(workbenchData(db, req.employee!));
});

admin.get('/dispatch', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(dispatchData(db, req.employee!));
});

function applyDayDecision(
  db: Db,
  actor: Employee,
  body: Record<string, unknown>,
): void {
  const employeeId = mustText(body.employeeId, 'Nhân viên', 1, 50);
  const employee = assertVisible(actor, db, employeeId);
  const date = mustText(body.date, 'Ngày', 10, 10);
  if (!isValidDate(date)) throw badRequest('Ngày không hợp lệ.');
  const kind = mustText(body.kind, 'Loại', 2, 30) as AdminTask['kind'];
  const action = mustText(body.action, 'Thao tác', 2, 30);
  const day = buildDay(db, employee, date);
  let override = db.overrides.find((o) => o.employeeId === employeeId && o.date === date);
  if (!override) {
    override = {
      id: nid('ov'),
      employeeId,
      date,
      at: nowIctIso(),
      updatedBy: actor.id,
    } as DayOverride;
    db.overrides.push(override);
  }
  override.at = nowIctIso();
  override.updatedBy = actor.id;
  const note = text(body.note, 300);
  if (note) override.note = note;

  if (kind === 'ot') {
    if (action === 'approve' || action === 'adjust') {
      const minutes = asInt(body.minutes) ?? day.otMinutes;
      if (minutes < 0 || minutes > 1440) throw badRequest('Số phút OT không hợp lệ.');
      override.otMinutes = minutes;
      override.noOt = false;
    } else if (action === 'reject' || action === 'none') {
      override.noOt = true;
      delete override.otMinutes;
    } else {
      throw badRequest('Thao tác OT không hợp lệ.');
    }
  } else if (kind === 'missing') {
    const cong = asNum(body.cong);
    if (cong === undefined || ![0, 0.5, 1].includes(cong)) {
      throw badRequest('Công duyệt phải là 0, 0,5 hoặc 1.');
    }
    override.cong = cong;
  } else if (kind === 'absence') {
    if (action === 'accept') override.cong = 0;
    else if (action === 'count') override.cong = 1;
    else if (action === 'half') override.cong = 0.5;
    else if (action === 'adjust') {
      const cong = asNum(body.cong);
      if (cong === undefined || cong < 0 || cong > 1) throw badRequest('Công không hợp lệ.');
      override.cong = cong;
    } else throw badRequest('Thao tác vắng mặt không hợp lệ.');
  } else if (kind === 'outside') {
    if (action === 'accept') override.acceptOutside = true;
    else if (action === 'reject') override.acceptOutside = false;
    else throw badRequest('Thao tác vị trí không hợp lệ.');
  } else if (kind === 'wrong_shift') {
    if (action === 'accept') override.acceptShift = true;
    else if (action === 'change') {
      const shiftId = mustText(body.shiftId, 'Ca', 1, 50);
      if (!shiftOf(db, shiftId)) throw badRequest('Ca không tồn tại.');
      override.shiftId = shiftId;
      override.acceptShift = true;
    } else throw badRequest('Thao tác ca không hợp lệ.');
  } else {
    throw badRequest('Loại cần xử lý không hợp lệ.');
  }

  db.decisions.unshift({
    id: nid('dc'),
    employeeId,
    date,
    kind,
    action,
    minutes: asInt(body.minutes),
    cong: asNum(body.cong),
    note,
    by: actor.id,
    at: nowIctIso(),
  });
}

function requestPrimaryDate(req: Request): string {
  const p = req.payload;
  if (p.kind === 'leave') return p.from;
  if (p.kind === 'swap') return p.fromDate;
  if (p.kind === 'register') return p.dates[0]?.date ?? todayIct();
  return p.date;
}

function decideRequest(
  db: Db,
  actor: Employee,
  requestId: string,
  action: string,
  note: string,
): void {
  const req = db.requests.find((r) => r.id === requestId);
  if (!req) throw notFound('Không tìm thấy đơn.');
  assertVisible(actor, db, req.employeeId);
  if (req.status !== 'pending') throw conflict('Đơn đã được xử lý.');
  if (action !== 'approve' && action !== 'reject') throw badRequest('Thao tác đơn không hợp lệ.');
  const status = action === 'approve' ? 'approved' : 'rejected';
  req.status = status;
  req.decidedAt = nowIctIso();
  req.decidedBy = actor.id;
  req.decisionNote = note || undefined;
  db.decisions.unshift({
    id: nid('dc'),
    employeeId: req.employeeId,
    date: requestPrimaryDate(req),
    kind: 'request',
    action: status,
    note,
    by: actor.id,
    at: nowIctIso(),
  });
  notify(
    db,
    req.employeeId,
    'request',
    `${requestLabel(req)} ${status === 'approved' ? 'đã được duyệt' : 'bị từ chối'}`,
    note || (status === 'approved' ? 'Đơn của bạn đã được quản lý chấp thuận.' : 'Đơn của bạn không được chấp thuận.'),
    '/m/don',
  );
}

admin.post('/decisions', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const requestId = text(req.body?.requestId, 80);
  const action = text(req.body?.action, 30);
  const note = text(req.body?.note, 300);
  await mutate((db) => {
    if (requestId) {
      decideRequest(db, actor, requestId, action, note);
    } else {
      applyDayDecision(db, actor, req.body as Record<string, unknown>);
    }
  });
  const db = await getDb();
  res.json(workbenchData(db, actor));
});

admin.post('/timesheet/bulk-approve', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw badRequest('Chưa chọn mục cần duyệt.');
  if (items.length > 100) throw badRequest('Mỗi lần duyệt tối đa 100 mục.');
  await mutate((db) => {
    for (const item of items) {
      const obj = item as Record<string, unknown>;
      if (obj.requestId) {
        decideRequest(db, actor, String(obj.requestId), 'approve', text(obj.note, 300));
      } else {
        applyDayDecision(db, actor, { ...obj, action: obj.action ?? 'approve' });
      }
    }
  });
  const db = await getDb();
  res.json({ ok: true, workbench: workbenchData(db, actor) });
});

admin.get('/timesheet', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(timesheetData(db, req.employee!, qstr(req.query.from), qstr(req.query.to)));
});

admin.get('/timesheet/:employeeId', async (req: AuthedRequest, res) => {
  const db = await getDb();
  const detail = employeeDetail(
    db,
    req.employee!,
    param(req, 'employeeId'),
    qstr(req.query.period),
  );
  if (!detail) throw notFound('Không tìm thấy nhân viên trong phạm vi quản lý.');
  res.json(detail);
});

admin.patch('/timesheet/:employeeId/:date', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const employeeId = param(req, 'employeeId');
  const date = param(req, 'date');
  if (!isValidDate(date)) throw badRequest('Ngày không hợp lệ.');
  const body = req.body ?? {};
  const result = await mutate((db) => {
    const employee = assertVisible(actor, db, employeeId);
    let override = db.overrides.find((o) => o.employeeId === employeeId && o.date === date);
    if (!override) {
      override = {
        id: nid('ov'),
        employeeId,
        date,
        at: nowIctIso(),
        updatedBy: actor.id,
      } as DayOverride;
      db.overrides.push(override);
    }
    if (body.cong !== undefined) {
      const cong = asNum(body.cong);
      if (cong === undefined || cong < 0 || cong > 1) throw badRequest('Công không hợp lệ.');
      override.cong = cong;
    }
    if (body.otMinutes !== undefined) {
      const m = asInt(body.otMinutes);
      if (m === undefined || m < 0 || m > 1440) throw badRequest('Số phút OT không hợp lệ.');
      override.otMinutes = m;
      override.noOt = false;
    }
    if (body.noOt === true) {
      override.noOt = true;
      delete override.otMinutes;
    }
    if (typeof body.acceptOutside === 'boolean') override.acceptOutside = body.acceptOutside;
    if (typeof body.acceptShift === 'boolean') override.acceptShift = body.acceptShift;
    if (typeof body.waiveLate === 'boolean') override.waiveLate = body.waiveLate;
    if (body.note !== undefined) override.note = text(body.note, 300);
    override.at = nowIctIso();
    override.updatedBy = actor.id;
    return { day: buildDay(db, employee, date), override };
  });
  res.json(result);
});

admin.get('/schedule', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(scheduleData(db, req.employee!, qstr(req.query.from), qstr(req.query.to)));
});

admin.put('/schedule', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const from = text(req.body?.from, 10);
  const to = text(req.body?.to, 10);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest('Khoảng ngày không hợp lệ.');
  if (eachDate(from, to).length > 31) throw badRequest('Chỉ lưu tối đa 31 ngày mỗi lần.');
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const employeeIds = Array.isArray(req.body?.employeeIds)
    ? req.body.employeeIds.map(String)
    : [...new Set(entries.map((e: { employeeId?: string }) => String(e.employeeId)))];
  await mutate((db) => {
    const visible = visibleEmployees(actor, db.employees);
    for (const id of employeeIds) {
      if (!visible.some((e) => e.id === id)) throw notFound('Nhân viên ngoài phạm vi quản lý.');
    }
    db.schedules = db.schedules.filter(
      (s) => !(employeeIds.includes(s.employeeId) && s.date >= from && s.date <= to),
    );
    const seen = new Set<string>();
    for (const raw of entries) {
      const entry = raw as { employeeId?: string; date?: string; shiftId?: string | null };
      if (!entry.employeeId || !entry.shiftId) continue;
      if (!employeeIds.includes(entry.employeeId)) continue;
      if (!entry.date || entry.date < from || entry.date > to) continue;
      if (!shiftOf(db, entry.shiftId)) throw badRequest('Ca không tồn tại.');
      const key = `${entry.employeeId}:${entry.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      db.schedules.push({
        id: nid('sch'),
        employeeId: entry.employeeId,
        date: entry.date,
        shiftId: entry.shiftId,
        status: 'scheduled',
      });
    }
  });
  const db = await getDb();
  res.json(scheduleData(db, actor, from, to));
});

admin.post('/schedule/spread', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const from = text(req.body?.from, 10);
  const to = text(req.body?.to, 10);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest('Khoảng ngày không hợp lệ.');
  if (eachDate(from, to).length > 31) throw badRequest('Khoảng ngày quá dài.');
  const employeeIds: string[] = Array.isArray(req.body?.employeeIds)
    ? req.body.employeeIds.map(String)
    : [];
  if (!employeeIds.length) throw badRequest('Chọn ít nhất một nhân viên.');
  const groups: { weekdays: number[]; shiftId: string }[] = Array.isArray(req.body?.groups)
    ? req.body.groups
    : [];
  if (!groups.length) throw badRequest('Thêm ít nhất một nhóm thứ.');
  const skipHolidays = bool(req.body?.skipHolidays, true);
  const removeOthers = bool(req.body?.removeOthers, true);
  await mutate((db) => {
    const visible = visibleEmployees(actor, db.employees);
    for (const id of employeeIds) {
      if (!visible.some((e) => e.id === id)) throw notFound('Nhân viên ngoài phạm vi quản lý.');
    }
    for (const g of groups) {
      if (!shiftOf(db, g.shiftId)) throw badRequest('Ca không tồn tại.');
      if (!Array.isArray(g.weekdays) || !g.weekdays.length) throw badRequest('Nhóm thứ trống.');
    }
    const holidaySet = new Set(db.holidays.map((h) => h.date));
    const dates = eachDate(from, to);
    db.schedules = db.schedules.filter(
      (s) => !(employeeIds.includes(s.employeeId) && s.date >= from && s.date <= to),
    );
    for (const employeeId of employeeIds) {
      for (const date of dates) {
        if (skipHolidays && holidaySet.has(date)) continue;
        const group = groups.find((g) => g.weekdays.includes(dowOf(date)));
        if (!group) {
          if (removeOthers) continue;
          continue;
        }
        db.schedules.push({
          id: nid('sch'),
          employeeId,
          date,
          shiftId: group.shiftId,
          status: 'scheduled',
        });
      }
    }
  });
  const db = await getDb();
  res.json(scheduleData(db, actor, from, to));
});

admin.post('/schedule/copy', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const from = text(req.body?.from, 10);
  const to = text(req.body?.to, 10);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest('Khoảng ngày không hợp lệ.');
  await mutate((db) => {
    const visible = new Set(visibleEmployees(actor, db.employees).map((e) => e.id));
    const dates = eachDate(from, to);
    const sourceFrom = addDays(from, -7);
    const sourceTo = addDays(to, -7);
    const source = db.schedules.filter(
      (s) => s.date >= sourceFrom && s.date <= sourceTo && visible.has(s.employeeId),
    );
    if (!source.length) throw conflict('Tuần trước chưa có lịch để chép.');
    db.schedules = db.schedules.filter(
      (s) => !(visible.has(s.employeeId) && s.date >= from && s.date <= to),
    );
    const sourceByOffset = new Map<string, string>();
    for (const s of source) {
      const offset = Math.round(
        (Date.parse(`${s.date}T00:00:00Z`) - Date.parse(`${sourceFrom}T00:00:00Z`)) / 86400000,
      );
      sourceByOffset.set(`${s.employeeId}:${offset}`, s.shiftId);
    }
    for (const employeeId of visible) {
      for (let i = 0; i < dates.length; i++) {
        const shiftId = sourceByOffset.get(`${employeeId}:${i}`);
        if (!shiftId) continue;
        db.schedules.push({
          id: nid('sch'),
          employeeId,
          date: dates[i],
          shiftId,
          status: 'scheduled',
        });
      }
    }
  });
  const db = await getDb();
  res.json(scheduleData(db, actor, from, to));
});

admin.get('/payroll', setupOnly, async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(payrollData(db, req.employee!, qstr(req.query.period)));
});

admin.post('/payroll/adjustments', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const employeeId = mustText(req.body?.employeeId, 'Nhân viên', 1, 50);
  const period = mustText(req.body?.period, 'Kỳ lương', 7, 7);
  if (!isValidPeriod(period)) throw badRequest('Kỳ lương không hợp lệ.');
  const amount = asInt(req.body?.amount);
  if (amount === undefined || amount === 0) throw badRequest('Số tiền phải khác 0.');
  if (Math.abs(amount) > 500_000_000) throw badRequest('Số tiền quá lớn.');
  const reason = mustText(req.body?.reason, 'Lý do', 3, 200);
  await mutate((db) => {
    employeeOrThrow(db, employeeId);
    if (publishedPayroll(db, period)?.status === 'published') {
      throw conflict('Kỳ lương đã công bố. Hãy công bố lại sau khi thêm thưởng/phạt.');
    }
    db.bonuses.push({
      id: nid('bn'),
      employeeId,
      period,
      amount,
      reason,
      createdAt: nowIctIso(),
      createdBy: actor.id,
    });
  });
  const db = await getDb();
  res.json(payrollData(db, actor, period));
});

admin.delete('/payroll/adjustments/:id', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const period = qstr(req.query.period);
  await mutate((db) => {
    const bonus = db.bonuses.find((b) => b.id === req.params.id);
    if (!bonus) throw notFound('Không tìm thấy khoản điều chỉnh.');
    if (publishedPayroll(db, bonus.period)?.status === 'published') {
      throw conflict('Kỳ lương đã công bố, không thể xoá.');
    }
    db.bonuses = db.bonuses.filter((b) => b.id !== bonus.id);
  });
  const db = await getDb();
  res.json(payrollData(db, actor, period || periodOf(todayIct())));
});

admin.post('/payroll/publish', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const period = text(req.body?.period, 7);
  if (!isValidPeriod(period)) throw badRequest('Kỳ lương không hợp lệ.');
  const result = await mutate((db) => {
    if (!db.settings.payrollEnabled) throw conflict('Tính lương đang tắt trong Cài đặt.');
    return publishPayroll(db, period, actor);
  });
  const db = await getDb();
  res.json({ ...result, data: payrollData(db, actor, period) });
});

admin.post('/payroll/revoke', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const period = text(req.body?.period, 7);
  if (!isValidPeriod(period)) throw badRequest('Kỳ lương không hợp lệ.');
  await mutate((db) => revokePayroll(db, period));
  const db = await getDb();
  res.json(payrollData(db, actor, period));
});

admin.get('/payroll/:employeeId', setupOnly, async (req: AuthedRequest, res) => {
  const db = await getDb();
  const employee = employeeOrThrow(db, param(req, 'employeeId'));
  const period = isValidPeriod(qstr(req.query.period)) ? qstr(req.query.period) : periodOf(todayIct());
  const { summary, months } = adminEmployeeSummary(db, employee, period);
  const published = db.payroll.find((p) => p.period === period && p.status === 'published');
  res.json({
    employee: sanitizeEmployee(employee),
    position: positionOf(db, employee),
    period,
    summary,
    months,
    slip: published?.slips.find((s) => s.employeeId === employee.id) ?? null,
    published: published?.status === 'published',
  });
});

admin.get('/employees', async (req: AuthedRequest, res) => {
  const db = await getDb();
  const employees = visibleEmployees(req.employee!, db.employees).map((e) => ({
    ...sanitizeEmployee(e),
    positionName: positionOf(db, e).name,
    managerName: db.employees.find((m) => m.id === e.managerId)?.name,
    hasDevice: !!e.deviceId,
  }));
  res.json({
    employees,
    positions: db.positions,
    managers: db.employees
      .filter((e) => e.status === 'active')
      .map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        positionId: e.positionId,
      })),
  });
});

interface EmployeeBody {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  positionId?: unknown;
  managerId?: unknown;
  status?: unknown;
  startDate?: unknown;
  contract?: unknown;
  tierId?: unknown;
  salaryOverride?: unknown;
  shiftOverrideId?: unknown;
  locationOverrideIds?: unknown;
  photoPolicy?: unknown;
  pin?: unknown;
  code?: unknown;
}

function validateEmployeeBody(
  db: Db,
  body: EmployeeBody,
  actor: Employee,
  existing?: Employee,
): {
  name: string;
  email: string;
  role: Role;
  positionId: string;
  managerId?: string;
  status: 'active' | 'inactive';
  startDate: string;
  contract: string;
  tierId?: string;
  salaryOverride?: number;
  shiftOverrideId?: string;
  locationOverrideIds?: string[];
  photoPolicy: Employee['photoPolicy'];
  pin?: string;
} {
  const name = mustText(body.name ?? existing?.name, 'Họ tên', 2, 80);
  const email = mustText(body.email ?? existing?.email, 'Email', 5, 120).toLowerCase();
  if (!emailOk(email)) throw badRequest('Email không hợp lệ.', 'email');
  if (db.employees.some((e) => e.email.toLowerCase() === email && e.id !== existing?.id)) {
    throw conflict('Email đã được dùng cho nhân viên khác.', 'EMAIL_TAKEN');
  }
  const role = body.role !== undefined ? validRole(body.role) : existing?.role ?? 'employee';
  if ((role === 'admin' || role === 'hr') && actor.role !== 'admin') {
    throw forbidden('Chỉ quản trị viên cấp cao mới có thể gán quyền này.');
  }
  const positionId = mustText(body.positionId ?? existing?.positionId, 'Vị trí', 1, 60);
  const position = db.positions.find((p) => p.id === positionId);
  if (!position) throw badRequest('Vị trí không tồn tại.', 'positionId');
  const managerId = body.managerId === null ? undefined : text(body.managerId, 60) || existing?.managerId;
  if (managerId) {
    if (managerId === existing?.id) throw badRequest('Nhân viên không thể tự làm quản lý của mình.');
    if (!db.employees.some((e) => e.id === managerId)) throw badRequest('Quản lý không tồn tại.');
  }
  const status = body.status === 'inactive' ? 'inactive' : statusOr(existing?.status, body.status);
  const startDate = text(body.startDate, 10) || existing?.startDate || todayIct();
  if (!isValidDate(startDate)) throw badRequest('Ngày bắt đầu không hợp lệ.');
  const contract = text(body.contract, 60) || existing?.contract || 'Toàn thời gian';
  const tierId = body.tierId === null ? undefined : text(body.tierId, 60) || existing?.tierId;
  if (tierId && !position.tiers.some((t) => t.id === tierId)) throw badRequest('Bậc lương không hợp lệ.');
  const salaryOverride =
    body.salaryOverride === null
      ? undefined
      : body.salaryOverride !== undefined
        ? asInt(body.salaryOverride)
        : existing?.salaryOverride;
  if (salaryOverride !== undefined && (salaryOverride < 0 || salaryOverride > 1_000_000_000)) {
    throw badRequest('Lương riêng không hợp lệ.');
  }
  const shiftOverrideId =
    body.shiftOverrideId === null
      ? undefined
      : text(body.shiftOverrideId, 60) || existing?.shiftOverrideId;
  if (shiftOverrideId && !db.shifts.some((s) => s.id === shiftOverrideId)) {
    throw badRequest('Ca riêng không tồn tại.');
  }
  let locationOverrideIds: string[] | undefined = existing?.locationOverrideIds;
  if (Array.isArray(body.locationOverrideIds)) {
    locationOverrideIds = body.locationOverrideIds.map(String).filter((id) => db.locations.some((l) => l.id === id));
  }
  const photoPolicy: Employee['photoPolicy'] =
    body.photoPolicy === 'required' || body.photoPolicy === 'exempt' || body.photoPolicy === 'company'
      ? body.photoPolicy
      : existing?.photoPolicy ?? 'company';
  const pinRaw = text(body.pin, 12);
  if (pinRaw && !/^\d{4,8}$/.test(pinRaw)) throw badRequest('PIN gồm 4–8 chữ số.', 'pin');
  return {
    name,
    email,
    role,
    positionId,
    managerId,
    status,
    startDate,
    contract,
    tierId,
    salaryOverride,
    shiftOverrideId,
    locationOverrideIds,
    photoPolicy,
    pin: pinRaw || undefined,
  };
}

function statusOr(existing: Employee['status'] | undefined, value: unknown): 'active' | 'inactive' {
  if (value === 'active' || value === 'inactive') return value;
  return existing ?? 'active';
}

admin.post('/employees', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const result = await mutate((db) => {
    const v = validateEmployeeBody(db, req.body ?? {}, actor);
    const pin = v.pin ?? createPin();
    const { pinHash, pinSalt } = hashPin(pin);
    const seq = db.employees.length + 1;
    const employee: Employee = {
      id: nid('e'),
      code: `AP${String(seq).padStart(3, '0')}`,
      name: v.name,
      email: v.email,
      role: v.role,
      positionId: v.positionId,
      managerId: v.managerId,
      status: v.status,
      startDate: v.startDate,
      contract: v.contract,
      tierId: v.tierId,
      salaryOverride: v.salaryOverride,
      shiftOverrideId: v.shiftOverrideId,
      locationOverrideIds: v.locationOverrideIds,
      photoPolicy: v.photoPolicy,
      pinHash,
      pinSalt,
      createdAt: nowIctIso(),
    };
    db.employees.push(employee);
    return { employee: sanitizeEmployee(employee), pin };
  });
  res.status(201).json(result);
});

admin.patch('/employees/:id', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const result = await mutate((db) => {
    const employee = employeeOrThrow(db, param(req, 'id'));
    if (
      employee.id === actor.id &&
      req.body?.status === 'inactive'
    ) {
      throw badRequest('Không thể tự vô hiệu hoá tài khoản đang đăng nhập.');
    }
    const v = validateEmployeeBody(db, req.body ?? {}, actor, employee);
    Object.assign(employee, {
      name: v.name,
      email: v.email,
      role: v.role,
      positionId: v.positionId,
      managerId: v.managerId,
      status: v.status,
      startDate: v.startDate,
      contract: v.contract,
      tierId: v.tierId,
      salaryOverride: v.salaryOverride,
      shiftOverrideId: v.shiftOverrideId,
      locationOverrideIds: v.locationOverrideIds,
      photoPolicy: v.photoPolicy,
    });
    return sanitizeEmployee(employee);
  });
  res.json(result);
});

admin.delete('/employees/:id', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  await mutate((db) => {
    const employee = employeeOrThrow(db, param(req, 'id'));
    if (employee.id === actor.id) throw badRequest('Không thể xoá chính mình.');
    if (employee.role === 'admin') {
      const admins = db.employees.filter((e) => e.role === 'admin' && e.status === 'active');
      if (admins.length <= 1) throw conflict('Không thể xoá quản trị viên cuối cùng.');
    }
    employee.status = 'inactive';
    employee.deviceId = undefined;
    employee.deviceLabel = undefined;
    for (const e of db.employees) {
      if (e.managerId === employee.id) e.managerId = actor.id;
    }
  });
  res.json({ ok: true });
});

admin.post('/employees/:id/reset-pin', setupOnly, async (req: AuthedRequest, res) => {
  const pinRaw = text(req.body?.pin, 12);
  const pin = pinRaw || createPin();
  if (!/^\d{4,8}$/.test(pin)) throw badRequest('PIN gồm 4–8 chữ số.');
  await mutate((db) => {
    const employee = employeeOrThrow(db, param(req, 'id'));
    const { pinHash, pinSalt } = hashPin(pin);
    employee.pinHash = pinHash;
    employee.pinSalt = pinSalt;
    employee.deviceId = undefined;
    employee.deviceLabel = undefined;
  });
  res.json({ pin });
});

admin.post('/employees/:id/unlock', setupOnly, async (req: AuthedRequest, res) => {
  await mutate((db) => {
    const employee = employeeOrThrow(db, param(req, 'id'));
    employee.deviceId = undefined;
    employee.deviceLabel = undefined;
  });
  res.json({ ok: true });
});

admin.post('/employees/unlock-all', setupOnly, async (req: AuthedRequest, res) => {
  const count = await mutate((db) => {
    let n = 0;
    for (const e of db.employees) {
      if (e.deviceId) {
        e.deviceId = undefined;
        e.deviceLabel = undefined;
        n++;
      }
    }
    return n;
  });
  res.json({ ok: true, count });
});

admin.post('/employees/bulk', setupOnly, async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const rows: unknown[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) throw badRequest('Chưa có dòng dữ liệu nào.');
  if (rows.length > 50) throw badRequest('Mỗi lần thêm tối đa 50 nhân viên.');
  const defaultPositionId = text(req.body?.positionId, 60);
  const result = await mutate((db) => {
    const created: { email: string; name: string; pin: string; employeeId: string }[] = [];
    const errors: { row: number; message: string }[] = [];
    const seen = new Set<string>();
    rows.forEach((raw, idx) => {
      const row = raw as { name?: string; email?: string; positionId?: string; positionName?: string };
      try {
        const posId =
          row.positionId ||
          db.positions.find(
            (p) => p.name.toLowerCase() === (row.positionName ?? '').toLowerCase(),
          )?.id ||
          defaultPositionId ||
          db.positions[0]?.id;
        if (!posId) throw new Error('Chưa có vị trí nào trong công ty.');
        const email = (row.email ?? '').trim().toLowerCase();
        if (seen.has(email)) throw new Error('Email trùng trong danh sách.');
        seen.add(email);
        const v = validateEmployeeBody(
          db,
          { name: row.name, email, positionId: posId, role: 'employee' },
          actor,
        );
        const pin = createPin();
        const { pinHash, pinSalt } = hashPin(pin);
        const employee: Employee = {
          id: nid('e'),
          code: `AP${String(db.employees.length + 1).padStart(3, '0')}`,
          name: v.name,
          email: v.email,
          role: 'employee',
          positionId: v.positionId,
          status: 'active',
          startDate: v.startDate,
          contract: v.contract,
          photoPolicy: 'company',
          pinHash,
          pinSalt,
          createdAt: nowIctIso(),
        };
        db.employees.push(employee);
        created.push({ email: v.email, name: v.name, pin, employeeId: employee.id });
      } catch (err) {
        errors.push({ row: idx + 1, message: (err as Error).message });
      }
    });
    return { created, errors };
  });
  res.json(result);
});

/* ------------------------- Vị trí & ca ---------------------------- */

function normalizePosition(db: Db, body: Record<string, unknown>, existing?: Position): Position {
  const name = mustText(body.name ?? existing?.name, 'Tên vị trí', 2, 80);
  if (db.positions.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== existing?.id)) {
    throw conflict('Tên vị trí đã tồn tại.', 'POSITION_TAKEN');
  }
  const salaryType =
    body.salaryType === 'shift' || body.salaryType === 'hour' || body.salaryType === 'month'
      ? body.salaryType
      : existing?.salaryType ?? 'month';
  const baseSalary = asInt(body.baseSalary ?? existing?.baseSalary);
  if (baseSalary === undefined || baseSalary < 0) throw badRequest('Mức lương không hợp lệ.');
  const shiftIds = Array.isArray(body.shiftIds)
    ? body.shiftIds.map(String)
    : existing?.shiftIds ?? [];
  if (!shiftIds.length) throw badRequest('Chọn ít nhất một ca làm việc.');
  for (const id of shiftIds) if (!shiftOf(db, id)) throw badRequest('Ca làm việc không tồn tại.');
  const locationIds = Array.isArray(body.locationIds)
    ? body.locationIds.map(String)
    : existing?.locationIds ?? [];
  for (const id of locationIds) if (!db.locations.some((l) => l.id === id)) throw badRequest('Địa điểm không tồn tại.');
  const tiersIn = Array.isArray(body.tiers) ? body.tiers : existing?.tiers ?? [];
  const tiers: Tier[] = tiersIn.map((raw) => {
    const t = raw as Partial<Tier>;
    const amount = asInt(t.amount) ?? 0;
    if (amount < 0) throw badRequest('Mức lương bậc không hợp lệ.');
    return {
      id: text(t.id, 60) || nid('tier'),
      name: text(t.name, 60) || 'Bậc',
      amount,
      headcount: Math.max(0, asInt(t.headcount) ?? 0),
    };
  });
  const allowancesIn = Array.isArray(body.allowances)
    ? body.allowances
    : existing?.allowances ?? [];
  const allowances: Allowance[] = allowancesIn.map((raw) => {
    const a = raw as Partial<Allowance>;
    return {
      id: text(a.id, 60) || nid('al'),
      name: text(a.name, 60) || 'Phụ cấp',
      amount: Math.max(0, asInt(a.amount) ?? 0),
      kind: a.kind === 'day' ? 'day' : 'month',
      enabled: bool(a.enabled, true),
    };
  });
  const otRatesIn = (body.otRates ?? existing?.otRates ?? {}) as Partial<Position['otRates']>;
  const otRate = (v: unknown, fallback: number) => {
    const n = asNum(v);
    return n !== undefined && n >= 1 && n <= 5 ? n : fallback;
  };
  const workdays = Array.isArray(body.workdays)
    ? body.workdays.map(Number).filter((n) => n >= 1 && n <= 7)
    : existing?.workdays;
  return {
    id: existing?.id ?? nid('p'),
    name,
    salaryType,
    baseSalary,
    tiers,
    flexible: bool(body.flexible, existing?.flexible ?? false),
    shiftIds,
    workdays: workdays?.length ? [...new Set(workdays)].sort() : undefined,
    leaveDays: Math.max(0, asInt(body.leaveDays ?? existing?.leaveDays) ?? 12),
    standardDays: Math.max(1, asInt(body.standardDays ?? existing?.standardDays) ?? 26),
    allowances,
    fixedBonus: Math.max(0, asInt(body.fixedBonus ?? existing?.fixedBonus) ?? 0),
    penaltiesEnabled: bool(body.penaltiesEnabled, existing?.penaltiesEnabled ?? true),
    insuranceEnabled: bool(body.insuranceEnabled, existing?.insuranceEnabled ?? true),
    otRates: {
      weekday: otRate(otRatesIn.weekday, existing?.otRates.weekday ?? 1.5),
      satOff: otRate(otRatesIn.satOff, existing?.otRates.satOff ?? 2),
      sun: otRate(otRatesIn.sun, existing?.otRates.sun ?? 2),
      holiday: otRate(otRatesIn.holiday, existing?.otRates.holiday ?? 3),
    },
    photoExempt: bool(body.photoExempt, existing?.photoExempt ?? false),
    locationIds,
    anywhere: bool(body.anywhere, existing?.anywhere ?? false),
    note: text(body.note, 500) || existing?.note,
    headcountWanted: Math.max(
      0,
      asInt(body.headcountWanted ?? existing?.headcountWanted) ?? 0,
    ),
  };
}

admin.get('/positions', setupOnly, async (_req, res) => {
  const db = await getDb();
  const positions = db.positions.map((p) => ({
    ...p,
    employeeCount: db.employees.filter((e) => e.positionId === p.id && e.status === 'active').length,
    shifts: p.shiftIds.map((id) => shiftOf(db, id)).filter(Boolean),
    locations: p.locationIds.map((id) => locationOf(db, id)).filter(Boolean),
  }));
  res.json({ positions, shifts: db.shifts, locations: db.locations });
});

admin.post('/positions', setupOnly, async (req: AuthedRequest, res) => {
  let created: Position | undefined;
  await mutate((db) => {
    const position = normalizePosition(db, req.body ?? {});
    db.positions.push(position);
    created = position;
  });
  res.status(201).json(created);
});

admin.patch('/positions/:id', setupOnly, async (req: AuthedRequest, res) => {
  let updated: Position | undefined;
  await mutate((db) => {
    const existing = db.positions.find((p) => p.id === req.params.id);
    if (!existing) throw notFound('Không tìm thấy vị trí.');
    const position = normalizePosition(db, req.body ?? {}, existing);
    Object.assign(existing, position);
    updated = existing;
  });
  res.json(updated);
});

admin.delete('/positions/:id', setupOnly, async (req: AuthedRequest, res) => {
  await mutate((db) => {
    const position = db.positions.find((p) => p.id === req.params.id);
    if (!position) throw notFound('Không tìm thấy vị trí.');
    if (db.employees.some((e) => e.positionId === position.id)) {
      throw conflict('Vị trí đang được gán cho nhân viên. Hãy chuyển nhân viên trước.');
    }
    db.positions = db.positions.filter((p) => p.id !== position.id);
    for (const loc of db.locations) {
      loc.positionIds = loc.positionIds.filter((id) => id !== position.id);
    }
  });
  res.json({ ok: true });
});

function normalizeShift(db: Db, body: Record<string, unknown>, existing?: Shift): Shift {
  const name = mustText(body.name ?? existing?.name, 'Tên ca', 2, 60);
  const code = (text(body.code, 10) || existing?.code || '').toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(code)) throw badRequest('Mã ca gồm 2–8 ký tự chữ/số.', 'code');
  if (db.shifts.some((s) => s.code === code && s.id !== existing?.id)) {
    throw conflict('Mã ca đã tồn tại.', 'SHIFT_CODE_TAKEN');
  }
  const start = text(body.start, 5) || existing?.start;
  const end = text(body.end, 5) || existing?.end;
  if (!isValidHm(start) || !isValidHm(end)) throw badRequest('Giờ ca không hợp lệ.');
  if (start === end) throw badRequest('Giờ bắt đầu và kết thúc không được trùng nhau.');
  const breakStart = text(body.breakStart, 5) || undefined;
  const breakEnd = text(body.breakEnd, 5) || undefined;
  if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
    throw badRequest('Cần nhập cả giờ bắt đầu và kết thúc nghỉ.');
  }
  if (breakStart && (!isValidHm(breakStart) || !isValidHm(breakEnd))) {
    throw badRequest('Giờ nghỉ giữa ca không hợp lệ.');
  }
  const calc =
    body.calc === 'actual' || body.calc === 'actual_late' || body.calc === 'frame'
      ? body.calc
      : existing?.calc ?? 'frame';
  const standardHours = Math.min(24, Math.max(0.5, asNum(body.standardHours ?? existing?.standardHours) ?? 8));
  return {
    id: existing?.id ?? nid('sh'),
    name,
    code,
    start,
    end,
    breakStart,
    breakEnd,
    calc,
    standardHours,
    fullMinutes: Math.max(0, asInt(body.fullMinutes ?? existing?.fullMinutes) ?? Math.round(standardHours * 60)),
    halfMinutes: Math.max(0, asInt(body.halfMinutes ?? existing?.halfMinutes) ?? Math.round(standardHours * 30)),
    lateAllow: Math.max(0, asInt(body.lateAllow ?? existing?.lateAllow) ?? 5),
    otMin: Math.max(0, asInt(body.otMin ?? existing?.otMin) ?? 30),
    composite: bool(body.composite, existing?.composite ?? false),
    noLate: bool(body.noLate, existing?.noLate ?? false),
    note: text(body.note, 300) || existing?.note,
  };
}

admin.get('/shifts', setupOnly, async (_req, res) => {
  const db = await getDb();
  res.json({
    shifts: db.shifts.map((s) => ({
      ...s,
      usedBy: db.positions.filter((p) => p.shiftIds.includes(s.id)).map((p) => p.name),
    })),
    holidays: db.holidays,
  });
});

admin.post('/shifts', setupOnly, async (req: AuthedRequest, res) => {
  let created: Shift | undefined;
  await mutate((db) => {
    const shift = normalizeShift(db, req.body ?? {});
    db.shifts.push(shift);
    created = shift;
  });
  res.status(201).json(created);
});

admin.patch('/shifts/:id', setupOnly, async (req: AuthedRequest, res) => {
  let updated: Shift | undefined;
  await mutate((db) => {
    const existing = db.shifts.find((s) => s.id === req.params.id);
    if (!existing) throw notFound('Không tìm thấy ca.');
    Object.assign(existing, normalizeShift(db, req.body ?? {}, existing));
    updated = existing;
  });
  res.json(updated);
});

admin.delete('/shifts/:id', setupOnly, async (req: AuthedRequest, res) => {
  await mutate((db) => {
    const shift = db.shifts.find((s) => s.id === req.params.id);
    if (!shift) throw notFound('Không tìm thấy ca.');
    if (db.positions.some((p) => p.shiftIds.includes(shift.id))) {
      throw conflict('Ca đang được dùng cho vị trí. Không thể xoá.');
    }
    if (db.schedules.some((s) => s.shiftId === shift.id)) {
      throw conflict('Ca đã có lịch làm việc. Không thể xoá.');
    }
    db.shifts = db.shifts.filter((s) => s.id !== shift.id);
  });
  res.json({ ok: true });
});

admin.post('/holidays', setupOnly, async (req: AuthedRequest, res) => {
  const date = mustText(req.body?.date, 'Ngày lễ', 10, 10);
  if (!isValidDate(date)) throw badRequest('Ngày lễ không hợp lệ.');
  const name = mustText(req.body?.name, 'Tên ngày lễ', 2, 80);
  let holiday: Holiday | undefined;
  await mutate((db) => {
    if (db.holidays.some((h) => h.date === date)) throw conflict('Ngày này đã có trong danh sách lễ.');
    holiday = { id: nid('h'), date, name };
    db.holidays.push(holiday);
    db.holidays.sort((a, b) => a.date.localeCompare(b.date));
  });
  res.status(201).json(holiday);
});

admin.delete('/holidays/:id', setupOnly, async (req: AuthedRequest, res) => {
  await mutate((db) => {
    db.holidays = db.holidays.filter((h) => h.id !== req.params.id);
  });
  res.json({ ok: true });
});

/* --------------------------- Địa điểm ----------------------------- */

function normalizeLocation(db: Db, body: Record<string, unknown>, existing?: Location): Location {
  const name = mustText(body.name ?? existing?.name, 'Tên địa điểm', 2, 80);
  const address = mustText(body.address ?? existing?.address, 'Địa chỉ', 3, 200);
  const lat = asNum(body.lat ?? existing?.lat);
  const lng = asNum(body.lng ?? existing?.lng);
  if (lat === undefined || lng === undefined || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw badRequest('Toạ độ không hợp lệ.');
  }
  const radius = asInt(body.radius ?? existing?.radius);
  if (radius === undefined || radius < 30 || radius > 3000) {
    throw badRequest('Bán kính phải trong khoảng 30–3000 m.');
  }
  const positionIds = Array.isArray(body.positionIds)
    ? body.positionIds.map(String).filter((id) => db.positions.some((p) => p.id === id))
    : existing?.positionIds ?? [];
  return {
    id: existing?.id ?? nid('loc'),
    name,
    address,
    lat,
    lng,
    radius,
    positionIds,
  };
}

function syncPositionLocations(db: Db, loc: Location): void {
  for (const position of db.positions) {
    const has = position.locationIds.includes(loc.id);
    const should = loc.positionIds.includes(position.id);
    if (should && !has) position.locationIds.push(loc.id);
    if (!should && has) position.locationIds = position.locationIds.filter((id) => id !== loc.id);
  }
}

admin.get('/locations', setupOnly, async (_req, res) => {
  const db = await getDb();
  res.json({
    locations: db.locations.map((l) => ({
      ...l,
      employeeCount: db.employees.filter(
        (e) =>
          (e.locationOverrideIds ?? positionOf(db, e).locationIds).includes(l.id) &&
          e.status === 'active',
      ).length,
    })),
    positions: db.positions,
  });
});

admin.post('/locations', setupOnly, async (req: AuthedRequest, res) => {
  let created: Location | undefined;
  await mutate((db) => {
    const loc = normalizeLocation(db, req.body ?? {});
    db.locations.push(loc);
    syncPositionLocations(db, loc);
    created = loc;
  });
  res.status(201).json(created);
});

admin.patch('/locations/:id', setupOnly, async (req: AuthedRequest, res) => {
  let updated: Location | undefined;
  await mutate((db) => {
    const existing = db.locations.find((l) => l.id === req.params.id);
    if (!existing) throw notFound('Không tìm thấy địa điểm.');
    Object.assign(existing, normalizeLocation(db, req.body ?? {}, existing));
    syncPositionLocations(db, existing);
    updated = existing;
  });
  res.json(updated);
});

admin.delete('/locations/:id', setupOnly, async (req: AuthedRequest, res) => {
  await mutate((db) => {
    const loc = db.locations.find((l) => l.id === req.params.id);
    if (!loc) throw notFound('Không tìm thấy địa điểm.');
    if (db.positions.some((p) => p.locationIds.includes(loc.id))) {
      throw conflict('Địa điểm đang được gán cho vị trí. Hãy bỏ gán trước.');
    }
    db.locations = db.locations.filter((l) => l.id !== loc.id);
  });
  res.json({ ok: true });
});

/* ---------------------------- Cài đặt ----------------------------- */

admin.get('/settings', setupOnly, async (_req, res) => {
  const db = await getDb();
  res.json({ company: db.company, settings: db.settings });
});

admin.patch('/settings', requireRole('admin'), async (req: AuthedRequest, res) => {
  const result = await mutate((db) => {
    const companyIn = (req.body?.company ?? {}) as Partial<Db['company']>;
    const settingsIn = (req.body?.settings ?? {}) as Partial<Settings>;
    if (companyIn.name !== undefined) {
      db.company.name = mustText(companyIn.name, 'Tên công ty', 2, 80);
    }
    if (companyIn.code !== undefined) {
      const code = mustText(companyIn.code, 'Mã công ty', 3, 20).toUpperCase();
      if (!/^[A-Z0-9]+$/.test(code)) throw badRequest('Mã công ty chỉ gồm chữ và số.');
      db.company.code = code;
    }
    if (companyIn.appName !== undefined) db.company.appName = mustText(companyIn.appName, 'Tên ứng dụng', 2, 60);
    if (companyIn.address !== undefined) db.company.address = text(companyIn.address, 200);
    if (companyIn.logoUrl !== undefined) {
      const url = text(companyIn.logoUrl, 500);
      if (url && !/^https?:\/\//.test(url) && !url.startsWith('/')) {
        throw badRequest('Logo phải là URL http(s) hoặc đường dẫn nội bộ.');
      }
      db.company.logoUrl = url || undefined;
    }
    if (companyIn.brandColor !== undefined) {
      const color = mustText(companyIn.brandColor, 'Màu thương hiệu', 4, 7);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw badRequest('Màu thương hiệu không hợp lệ.');
      db.company.brandColor = color;
    }
    if (Array.isArray(settingsIn.workdays)) {
      const wd = settingsIn.workdays.map(Number).filter((n) => n >= 1 && n <= 7);
      if (!wd.length) throw badRequest('Chọn ít nhất một ngày làm việc.');
      db.settings.workdays = [...new Set(wd)].sort();
    }
    if (settingsIn.lateMode === 'full' || settingsIn.lateMode === 'excess') {
      db.settings.lateMode = settingsIn.lateMode;
    }
    for (const key of [
      'allowEarlyOT',
      'autoOtFromRequest',
      'requirePhoto',
      'payrollEnabled',
      'lateExplain',
    ] as const) {
      if (typeof settingsIn[key] === 'boolean') db.settings[key] = settingsIn[key] as boolean;
    }
    for (const key of ['otMinMinutes', 'payCloseDay'] as const) {
      if (settingsIn[key] !== undefined) {
        const n = asInt(settingsIn[key]);
        if (n === undefined || n < 0 || n > 240) throw badRequest('Giá trị cài đặt không hợp lệ.');
        db.settings[key] = n;
      }
    }
    if (settingsIn.sheetUrl !== undefined) db.settings.sheetUrl = text(settingsIn.sheetUrl, 300) || undefined;
    if (settingsIn.driveUrl !== undefined) db.settings.driveUrl = text(settingsIn.driveUrl, 300) || undefined;
    return { company: db.company, settings: db.settings };
  });
  res.json(result);
});

admin.post('/reset', requireRole('admin'), async (req: AuthedRequest, res) => {
  if (req.body?.confirm !== 'RESET') throw badRequest('Xác nhận không đúng.');
  await resetDb();
  res.json({ ok: true });
});

/* ------------------------------ Export ---------------------------- */

admin.get('/export/timesheet', setupOnly, async (req: AuthedRequest, res) => {
  const db = await getDb();
  const data = timesheetData(db, req.employee!, qstr(req.query.from), qstr(req.query.to));
  const headers = [
    'Mã NV',
    'Họ tên',
    'Vị trí',
    'Ngày',
    'Thứ',
    'Ca',
    'Giờ vào',
    'Giờ ra',
    'Công',
    'Muộn (phút)',
    'OT đã duyệt (phút)',
    'Trạng thái',
    'Ghi chú',
  ];
  const rows: (string | number)[][] = [];
  for (const row of data.rows) {
    for (const day of row.days) {
      rows.push([
        row.employee.code,
        row.employee.name,
        row.position.name,
        fmtDateVN(day.date),
        WEEKDAY_LABELS[day.weekday] ?? '',
        day.shiftCode ?? '',
        day.inAt ? partyTime(day.inAt) : '',
        day.outAt ? partyTime(day.outAt) : '',
        day.cong,
        day.lateMinutes,
        day.approvedOtMinutes,
        day.holidayName ?? DAY_STATUS_LABEL[day.status] ?? day.status,
        day.overrideNote ?? day.requestNote ?? '',
      ]);
    }
  }
  sendXls(
    res,
    `bang-cong-${data.from}-${data.to}.xls`,
    `Bảng công ${fmtDateVN(data.from)} – ${fmtDateVN(data.to)} · ${db.company.name}`,
    headers,
    rows,
  );
});

admin.get('/export/payroll', setupOnly, async (req: AuthedRequest, res) => {
  const db = await getDb();
  const data = payrollData(db, req.employee!, qstr(req.query.period));
  const rows = data.rows.map((r) => [
    r.employee?.code ?? '',
    r.slip.name,
    r.slip.positionName,
    r.slip.cong,
    r.slip.otMinutes,
    r.slip.basePay,
    r.slip.otPay,
    r.slip.allowances,
    r.slip.fixedBonus,
    r.slip.adjustments,
    -r.slip.insurance,
    r.slip.net,
    r.frozen ? 'Đã công bố' : r.readiness === 'ready' ? 'Sẵn sàng' : 'Cần xử lý',
  ]);
  sendXls(
    res,
    `bang-luong-${data.period}.xls`,
    `Bảng lương ${fmtPeriodVN(data.period)} · ${db.company.name}`,
    [
      'Mã NV',
      'Họ tên',
      'Vị trí',
      'Công',
      'OT (phút)',
      'Lương cơ bản',
      'Tiền OT',
      'Phụ cấp',
      'Thưởng cố định',
      'Thưởng/phạt',
      'BHXH',
      'Thực lĩnh',
      'Trạng thái',
    ],
    rows,
  );
});

const WEEKDAY_LABELS = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

api.use('/admin', admin);

/* ------------------------------------------------------------------ */
/* Employee app                                                       */
/* ------------------------------------------------------------------ */

const me = express.Router();
me.use(authMiddleware);

me.get('/home', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(employeeHome(db, req.employee!));
});

me.get('/timesheet', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json(employeeTimesheet(db, req.employee!, qstr(req.query.period)));
});

me.get('/schedule', async (req: AuthedRequest, res) => {
  const db = await getDb();
  const today = todayIct();
  const start = qstr(req.query.from) || today;
  const end = qstr(req.query.to) || addDays(start, 13);
  res.json(employeeScheduleData(db, req.employee!, start, end));
});

me.get('/requests', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json({ requests: employeeRequests(db, req.employee!) });
});

me.get('/notifications', async (req: AuthedRequest, res) => {
  const db = await getDb();
  res.json({
    notifications: db.notifications
      .filter((n) => n.employeeId === req.employee!.id)
      .sort((a, b) => b.at.localeCompare(a.at)),
  });
});

me.post('/notifications/read', async (req: AuthedRequest, res) => {
  const id = text(req.body?.id, 80);
  await mutate((db) => {
    for (const n of db.notifications) {
      if (n.employeeId === req.employee!.id && (!id || n.id === id)) n.read = true;
    }
  });
  res.json({ ok: true });
});

me.get('/payslips', async (req: AuthedRequest, res) => {
  const db = await getDb();
  const year = asInt(req.query.year) ?? Number(todayIct().slice(0, 4));
  res.json(employeePayslips(db, req.employee!, year));
});

me.get('/payslips/:period', async (req: AuthedRequest, res) => {
  const db = await getDb();
  const period = param(req, 'period');
  if (!isValidPeriod(period)) throw badRequest('Kỳ lương không hợp lệ.');
  const slip =
    db.payroll
      .find((p) => p.period === period && p.status === 'published')
      ?.slips.find((s) => s.employeeId === req.employee!.id) ?? null;
  if (!slip) {
    throw new ApiError(409, 'PAYSLIP_NOT_PUBLISHED', 'Phiếu lương chưa được công bố.');
  }
  res.json({ slip, company: db.company });
});

me.post('/punch', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const lat = asNum(req.body?.lat);
  const lng = asNum(req.body?.lng);
  if (lat === undefined || lng === undefined || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw badRequest('Không nhận được vị trí hợp lệ.');
  }
  const accuracy = Math.min(5000, Math.max(0, asInt(req.body?.accuracy) ?? 0));
  const note = text(req.body?.note, 300);
  const photoData = typeof req.body?.photo === 'string' ? req.body.photo : undefined;
  const db = await getDb();
  const employeeNow = db.employees.find((e) => e.id === actor.id)!;
  const position = positionOf(db, employeeNow);
  const now = ictParts();
  const target = resolvePunchTarget(db, employeeNow, now.minutes, now.date);
  if (!target.shiftId) throw badRequest('Hôm nay bạn không có ca làm việc để chấm công.');
  const nearest = nearestLocation(db, employeeNow, lat, lng);
  if (nearest.outside) {
    throw new ApiError(
      422,
      'OUTSIDE_ZONE',
      nearest.location
        ? `Bạn đang cách ${nearest.location.name} ${nearest.distance} m, ngoài phạm vi ${nearest.location.radius} m.`
        : 'Bạn đang ở ngoài phạm vi chấm công.',
      undefined,
      {
        distance: nearest.distance,
        radius: nearest.location?.radius,
        locationName: nearest.location?.name,
        lat,
        lng,
      },
    );
  }
  const requirePhoto =
    employeeNow.photoPolicy === 'required' ||
    (employeeNow.photoPolicy !== 'exempt' && !position.photoExempt && db.settings.requirePhoto);
  if (requirePhoto && !photoData) {
    throw badRequest('Công ty yêu cầu ảnh khi chấm công.', 'photo');
  }
  let photoPath: string | undefined;
  if (photoData) {
    photoPath = await savePhoto(photoData);
    if (!photoPath && requirePhoto) throw badRequest('Ảnh không hợp lệ.', 'photo');
  }
  const result = await mutate((d) => {
    const employee = d.employees.find((e) => e.id === actor.id);
    if (!employee || employee.status !== 'active') throw unauthorized();
    const existing = d.punches.filter(
      (p) => p.employeeId === employee.id && p.workDate === target.workDate,
    );
    const hasIn = existing.some((p) => p.kind === 'in');
    const hasOut = existing.some((p) => p.kind === 'out');
    const kind: 'in' | 'out' = !hasIn ? 'in' : !hasOut ? 'out' : 'in';
    if (kind === 'in' && hasIn) throw conflict('Hôm nay bạn đã chấm công vào ca.', 'ALREADY_PUNCHED');
    if (kind === 'out' && hasOut) throw conflict('Hôm nay bạn đã chấm công ra ca.', 'ALREADY_PUNCHED');
    const punch = {
      id: nid('pu'),
      employeeId: employee.id,
      workDate: target.workDate,
      shiftId: target.shiftId,
      at: nowIctIso(),
      kind,
      lat,
      lng,
      accuracy,
      locationId: nearest.location?.id,
      outside: false,
      distance: nearest.distance,
      photo: photoPath,
      note: note || undefined,
    };
    d.punches.push(punch);
    const day = buildDay(d, employee, target.workDate);
    return { punch, day, kind, locationName: nearest.location?.name, distance: nearest.distance };
  });
  res.json({
    ...result,
    message:
      result.kind === 'in'
        ? `Đã chấm công vào ca lúc ${partyTime(result.punch.at)}`
        : `Đã chấm công ra ca lúc ${partyTime(result.punch.at)}`,
  });
});

me.post('/requests', async (req: AuthedRequest, res) => {
  const actor = req.employee!;
  const type = text(req.body?.type, 20) as Request['type'];
  const payload = req.body?.payload as RequestPayload;
  if (!payload || typeof payload !== 'object') throw badRequest('Thiếu nội dung đơn.');
  const allowed: Request['type'][] = ['leave', 'late_early', 'ot', 'swap', 'register', 'forgot', 'explain'];
  if (!allowed.includes(type)) throw badRequest('Loại đơn không hợp lệ.');
  if (payload.kind !== type) throw badRequest('Nội dung đơn không khớp loại đơn.');
  const msg = validateRequestPayload(payload);
  if (msg) throw badRequest(msg);
  const today = todayIct();
  const db = await getDb();
  const position = positionOf(db, actor);

  if (payload.kind === 'leave') {
    if (payload.from < today) throw badRequest('Không thể xin nghỉ cho ngày đã qua.');
    if (overlappingLeave(db.requests, actor.id, payload.from, payload.to)) {
      throw conflict('Bạn đã có đơn nghỉ trùng khoảng ngày này.', 'LEAVE_OVERLAP');
    }
    if (payload.leaveType === 'annual') {
      const days = eachDate(payload.from, payload.to).length;
      const remaining = leaveBalance(db, actor, Number(today.slice(0, 4)));
      if (days > remaining) throw badRequest(`Bạn chỉ còn ${remaining} ngày phép năm.`);
    }
  }
  if (payload.kind === 'late_early') {
    if (payload.date < addDays(today, -7) || payload.date > addDays(today, 30)) {
      throw badRequest('Chỉ gửi đơn trong vòng 7 ngày trước hoặc 30 ngày tới.');
    }
    const duplicate = db.requests.some(
      (r) =>
        r.employeeId === actor.id &&
        r.status === 'pending' &&
        r.type === 'late_early' &&
        r.payload.kind === 'late_early' &&
        r.payload.date === payload.date,
    );
    if (duplicate) throw conflict('Đã có đơn đi muộn/về sớm cho ngày này.');
  }
  if (payload.kind === 'ot') {
    const shift = shiftOf(db, payload.shiftId);
    if (!shift) throw badRequest('Ca làm thêm không tồn tại.');
    const duration = requestDuration({ type: 'ot', payload } as Request);
    if (duration < Math.max(shift.otMin, db.settings.otMinMinutes)) {
      throw badRequest(`Thời gian làm thêm tối thiểu ${Math.max(shift.otMin, db.settings.otMinMinutes)} phút.`);
    }
    if (payload.date < addDays(today, -1) || payload.date > addDays(today, 30)) {
      throw badRequest('Ngày làm thêm không hợp lệ.');
    }
    const duplicate = db.requests.some(
      (r) =>
        r.employeeId === actor.id &&
        r.status === 'pending' &&
        r.type === 'ot' &&
        r.payload.kind === 'ot' &&
        r.payload.date === payload.date,
    );
    if (duplicate) throw conflict('Đã có đơn làm thêm chờ duyệt cho ngày này.');
  }
  if (payload.kind === 'swap') {
    if (payload.fromDate < today || payload.toDate < today) {
      throw badRequest('Ngày đổi ca không được ở quá khứ.');
    }
    if (payload.fromShiftId === payload.toShiftId && payload.fromDate === payload.toDate) {
      throw badRequest('Ca đổi không có gì thay đổi.');
    }
  }
  if (payload.kind === 'register') {
    for (const d of payload.dates) {
      if (d.date < today) throw badRequest('Không thể đăng ký ca cho ngày đã qua.');
      if (d.date > addDays(today, 21)) throw badRequest('Chỉ đăng ký ca trong 3 tuần tới.');
      if (!position.shiftIds.includes(d.shiftId)) throw badRequest('Ca không thuộc vị trí của bạn.');
    }
    const keys = new Set(payload.dates.map((d) => `${d.date}:${d.shiftId}`));
    if (keys.size !== payload.dates.length) throw badRequest('Danh sách ca bị trùng.');
  }
  if (payload.kind === 'forgot') {
    if (payload.date > today) throw badRequest('Chưa thể báo quên cho ngày trong tương lai.');
    if (payload.date < addDays(today, -30)) throw badRequest('Chỉ báo quên trong vòng 30 ngày.');
    const sched = effectiveSchedule(db, actor, payload.date);
    if (!sched.shift) throw badRequest('Ngày này bạn không có ca làm việc.');
    const punches = db.punches.filter(
      (p) => p.employeeId === actor.id && p.workDate === payload.date,
    );
    const hasIn = punches.some((p) => p.kind === 'in');
    const hasOut = punches.some((p) => p.kind === 'out');
    if (hasIn && payload.inTime) throw badRequest('Hệ thống đã có giờ vào, không cần báo quên giờ vào.');
    if (hasOut && payload.outTime) throw badRequest('Hệ thống đã có giờ ra, không cần báo quên giờ ra.');
    if (hasIn && hasOut) throw badRequest('Ngày này đã có đủ giờ vào và ra.');
    const duplicate = db.requests.some(
      (r) =>
        r.employeeId === actor.id &&
        r.status === 'pending' &&
        r.type === 'forgot' &&
        r.payload.kind === 'forgot' &&
        r.payload.date === payload.date,
    );
    if (duplicate) throw conflict('Đã có đơn báo quên cho ngày này.');
  }
  if (payload.kind === 'explain') {
    if (payload.date > today) throw badRequest('Chưa thể giải trình cho ngày trong tương lai.');
    if (payload.date < addDays(today, -30)) throw badRequest('Chỉ giải trình trong vòng 30 ngày.');
  }

  const request: Request = {
    id: nid('rq'),
    employeeId: actor.id,
    type,
    status: 'pending',
    payload,
    createdAt: nowIctIso(),
  };
  await mutate((d) => {
    d.requests.unshift(request);
    notify(
      d,
      actor.id,
      'request',
      `Đã gửi ${requestLabel(request).toLowerCase()}`,
      'Đơn đang chờ quản lý xử lý. Bạn sẽ nhận thông báo khi có kết quả.',
      '/m/don',
    );
  });
  res.status(201).json(request);
});

api.use('/me', me);

api.use((_req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Không tìm thấy API.' });
});
