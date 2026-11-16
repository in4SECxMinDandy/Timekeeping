import type {
  DayResult,
  Db,
  Employee,
  Holiday,
  Location,
  Payslip,
  Position,
  Punch,
  Request,
  Schedule,
  Shift,
} from '../shared/types';
import {
  addDays,
  baseSalaryOf,
  computeDay,
  DAY_STATUS_LABEL,
  dowOf,
  fmtDateVN,
  fmtPeriodVN,
  hmToMinutes,
  holidaySet,
  minutesSince,
  monthRange,
  nowIctIso,
  partyTime,
  requestDuration,
  summarizeMonth,
  todayIct,
  usedAnnualLeave,
} from '../shared/domain';

export function positionOf(db: Db, employee: Employee): Position {
  const pos = db.positions.find((p) => p.id === employee.positionId);
  if (!pos) throw new Error(`Vị trí không tồn tại: ${employee.positionId}`);
  return pos;
}

export function shiftOf(db: Db, id?: string): Shift | undefined {
  return id ? db.shifts.find((s) => s.id === id) : undefined;
}

export function locationOf(db: Db, id?: string): Location | undefined {
  return id ? db.locations.find((l) => l.id === id) : undefined;
}

export function holidayOf(db: Db, date: string): Holiday | undefined {
  return holidaySet(db.holidays).get(date);
}

export interface EffectiveSchedule {
  shift?: Shift;
  source: 'base' | 'registered' | 'swap' | 'override';
  offBySwap: boolean;
  base?: Schedule;
}

export function effectiveSchedule(db: Db, employee: Employee, date: string): EffectiveSchedule {
  const base = db.schedules.find((s) => s.employeeId === employee.id && s.date === date);
  const override = db.overrides.find((o) => o.employeeId === employee.id && o.date === date);
  let shift = shiftOf(db, base?.shiftId);
  let source: EffectiveSchedule['source'] = 'base';
  let offBySwap = false;

  for (const req of db.requests) {
    if (req.employeeId !== employee.id || req.status !== 'approved') continue;
    const p = req.payload;
    if (p.kind === 'swap') {
      if (p.fromDate === date) offBySwap = true;
      if (p.toDate === date) {
        shift = shiftOf(db, p.toShiftId);
        source = 'swap';
        offBySwap = false;
      }
    }
    if (p.kind === 'register') {
      const hit = p.dates.find((d) => d.date === date);
      if (hit) {
        shift = shiftOf(db, hit.shiftId);
        source = 'registered';
      }
    }
  }
  if (override?.shiftId) {
    shift = shiftOf(db, override.shiftId);
    source = 'override';
    offBySwap = false;
  }
  if (offBySwap) shift = undefined;
  return { shift, source, offBySwap, base };
}

export function approvedLeaveFor(
  db: Db,
  employeeId: string,
  date: string,
): Request | undefined {
  return db.requests.find((r) => {
    if (r.employeeId !== employeeId || r.type !== 'leave' || r.status !== 'approved') return false;
    const p = r.payload;
    return p.kind === 'leave' && p.from <= date && p.to >= date;
  });
}

export function forgotFor(db: Db, employeeId: string, date: string): Request | undefined {
  return db.requests.find((r) => {
    if (r.employeeId !== employeeId || r.type !== 'forgot' || r.status !== 'approved') return false;
    return r.payload.kind === 'forgot' && r.payload.date === date;
  });
}

export function approvedOtMinutes(db: Db, employeeId: string, date: string): number {
  const override = db.overrides.find((o) => o.employeeId === employeeId && o.date === date);
  if (override?.noOt) return 0;
  if (override?.otMinutes !== undefined) return override.otMinutes;
  return db.requests
    .filter((r) => {
      if (r.employeeId !== employeeId || r.type !== 'ot' || r.status !== 'approved') return false;
      return r.payload.kind === 'ot' && r.payload.date === date;
    })
    .reduce((sum, r) => sum + requestDuration(r), 0);
}

export function waiversFor(
  db: Db,
  employeeId: string,
  date: string,
): { late: boolean; early: boolean; explain?: Request } {
  let late = false;
  let early = false;
  let explain: Request | undefined;
  for (const r of db.requests) {
    if (r.employeeId !== employeeId || r.status !== 'approved') continue;
    const p = r.payload;
    if (p.kind === 'late_early' && p.date === date) {
      if (p.mode === 'late') late = true;
      else early = true;
    }
    if (p.kind === 'explain' && p.date === date) {
      late = true;
      explain = r;
    }
  }
  return { late, early, explain };
}

export function punchTimes(p: Punch | undefined): string {
  return p ? partyTime(p.at) : '';
}

export function buildDay(
  db: Db,
  employee: Employee,
  date: string,
  today = todayIct(),
): DayResult {
  const position = positionOf(db, employee);
  const { shift, source, offBySwap } = effectiveSchedule(db, employee, date);
  const overrideRaw = db.overrides.find((o) => o.employeeId === employee.id && o.date === date);
  let override = overrideRaw;
  const waivers = waiversFor(db, employee.id, date);
  if (waivers.explain) {
    override = {
      ...(override ?? {
        id: 'derived',
        employeeId: employee.id,
        date,
        at: nowIctIso(),
      }),
      waiveLate: true,
      acceptShift: true,
      note: override?.note ?? 'Giải trình đã được duyệt',
    };
  }
  const leaveReq = approvedLeaveFor(db, employee.id, date);
  const leavePayload = leaveReq?.payload.kind === 'leave' ? leaveReq.payload : undefined;
  const forgotReq = forgotFor(db, employee.id, date);
  const forgot = forgotReq?.payload.kind === 'forgot' ? forgotReq.payload : undefined;
  const punches = db.punches.filter((p) => p.employeeId === employee.id && p.workDate === date);
  const weekday = dowOf(date);

  const result = computeDay({
    date,
    weekday,
    isToday: date === today,
    isFuture: date > today,
    nowMinutes: date === today ? minutesSince(date, nowIctIso()) : undefined,
    isHoliday: holidayOf(db, date),
    isWeekend: weekday >= 6,
    shift,
    scheduleSource: source,
    offBySwap,
    punches,
    leave: leavePayload
      ? {
          kind: leavePayload.leaveType,
          composite: shift?.composite ?? position.flexible,
        }
      : undefined,
    forgot: forgot ? { inTime: forgot.inTime, outTime: forgot.outTime } : undefined,
    override,
    approvedOtMinutes: approvedOtMinutes(db, employee.id, date),
    waiveLate: waivers.late,
    waiveEarly: waivers.early,
    settings: db.settings,
    position,
  });
  result.scheduleSource = source;
  if (leavePayload) {
    result.leaveKind = leavePayload.leaveType;
    result.requestNote = `Nghỉ phép: ${leavePayload.reason}`;
  } else if (waivers.explain) {
    result.requestNote = `Giải trình: ${waivers.explain.payload.kind === 'explain' ? waivers.explain.payload.reason : ''}`;
  }
  return result;
}

export function buildMonth(
  db: Db,
  employee: Employee,
  period: string,
  today = todayIct(),
): { days: DayResult[]; summary: ReturnType<typeof summarizeMonth> } {
  const { days } = monthRange(period);
  const results = days.map((d) => buildDay(db, employee, d, today));
  const position = positionOf(db, employee);
  const adjustments = db.bonuses
    .filter((b) => b.employeeId === employee.id && b.period === period)
    .reduce((s, b) => s + b.amount, 0);
  const summary = summarizeMonth(employee, position, period, results, adjustments);
  return { days: results, summary };
}

export function leaveBalance(db: Db, employee: Employee, year: number): number {
  const position = positionOf(db, employee);
  return Math.max(0, position.leaveDays - usedAnnualLeave(db.requests, employee.id, year));
}

export function buildSlip(
  db: Db,
  employee: Employee,
  period: string,
  today = todayIct(),
  publishedAt = nowIctIso(),
): Payslip {
  const position = positionOf(db, employee);
  const { days, summary } = buildMonth(db, employee, period, today);
  return {
    employeeId: employee.id,
    name: employee.name,
    positionName: position.name,
    period,
    baseSalary: baseSalaryOf(employee, position),
    salaryType: position.salaryType,
    cong: summary.cong,
    standardDays: position.standardDays,
    workedMinutes: summary.workedMinutes,
    otMinutes: summary.otApprovedMinutes,
    otPay: summary.otPay,
    basePay: summary.basePay,
    allowances: summary.allowances,
    fixedBonus: summary.fixedBonus,
    adjustments: summary.adjustments,
    insurance: summary.insurance,
    gross: summary.gross,
    net: summary.net,
    lines: summary.lines,
    days: days.map((d) => ({
      date: d.date,
      status: d.status,
      label: payslipDayLabel(d),
      inAt: d.inAt,
      outAt: d.outAt,
      cong: d.cong,
      lateMinutes: d.lateMinutes,
      otMinutes: d.approvedOtMinutes,
    })),
    publishedAt,
  };
}

function payslipDayLabel(d: DayResult): string {
  if (d.holidayName) return d.holidayName;
  if (d.status === 'leave') return 'Nghỉ phép';
  if (d.status === 'absent') return 'Vắng';
  if (d.status === 'missing') return 'Thiếu chấm công';
  if (d.status === 'future') return 'Chưa tới';
  if (d.status === 'off') return 'Nghỉ';
  const parts: string[] = [DAY_STATUS_LABEL[d.status] ?? 'Đủ công'];
  if (d.lateMinutes) parts.push(`muộn ${d.lateMinutes}'`);
  if (d.approvedOtMinutes) parts.push(`OT ${d.approvedOtMinutes}'`);
  return parts.join(' · ');
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function nearestLocation(
  db: Db,
  employee: Employee,
  lat: number,
  lng: number,
): { location?: Location; distance: number; outside: boolean } {
  const position = positionOf(db, employee);
  const ids = employee.locationOverrideIds ?? position.locationIds;
  const candidates = db.locations.filter((l) => ids.includes(l.id));
  if (!candidates.length) {
    return { distance: 0, outside: !position.anywhere };
  }
  let best = candidates[0];
  let bestDistance = haversine(lat, lng, best.lat, best.lng);
  for (const loc of candidates.slice(1)) {
    const d = haversine(lat, lng, loc.lat, loc.lng);
    if (d < bestDistance) {
      best = loc;
      bestDistance = d;
    }
  }
  if (position.anywhere) return { location: best, distance: bestDistance, outside: false };
  return { location: best, distance: bestDistance, outside: bestDistance > best.radius };
}

export function resolvePunchTarget(
  db: Db,
  employee: Employee,
  nowMinutes: number,
  today: string,
): { workDate: string; shiftId?: string; scheduledShiftId?: string } {
  const todaySched = effectiveSchedule(db, employee, today);
  const yesterday = addDays(today, -1);
  const ySched = effectiveSchedule(db, employee, yesterday);
  if (ySched.shift) {
    const b = shiftBoundsLocal(ySched.shift);
    if (b.overnight && nowMinutes < b.end - 1440 + 180) {
      return {
        workDate: yesterday,
        shiftId: pickPunchShift(db, employee, ySched.shift, nowMinutes + 1440),
        scheduledShiftId: ySched.shift.id,
      };
    }
  }
  if (todaySched.shift) {
    return {
      workDate: today,
      shiftId: pickPunchShift(db, employee, todaySched.shift, nowMinutes),
      scheduledShiftId: todaySched.shift.id,
    };
  }
  const position = positionOf(db, employee);
  let best: Shift | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const id of position.shiftIds) {
    const sh = shiftOf(db, id);
    if (!sh) continue;
    const b = shiftBoundsLocal(sh);
    const score = nowMinutes < b.start ? b.start - nowMinutes + 240 : Math.abs(nowMinutes - b.start);
    if (score < bestScore) {
      best = sh;
      bestScore = score;
    }
  }
  return { workDate: today, shiftId: best?.id };
}

function pickPunchShift(
  db: Db,
  employee: Employee,
  scheduled: Shift,
  nowMinutes: number,
): string {
  const position = positionOf(db, employee);
  const candidates = db.shifts.filter(
    (s) => position.shiftIds.includes(s.id) || s.id === scheduled.id,
  );
  let best = scheduled;
  let bestScore = scoreShift(scheduled, nowMinutes);
  for (const sh of candidates) {
    const score = scoreShift(sh, nowMinutes);
    if (score + 3 < bestScore) {
      best = sh;
      bestScore = score;
    }
  }
  return best.id;
}

function scoreShift(shift: Shift, nowMinutes: number): number {
  const start = hmToMinutes(shift.start);
  const end = hmToMinutes(shift.end);
  if (nowMinutes >= start - 90 && nowMinutes <= end + 120) {
    return Math.abs(nowMinutes - start);
  }
  return Math.abs(nowMinutes - start) + 1000;
}

function shiftBoundsLocal(shift: Shift) {
  const start = hmToMinutes(shift.start);
  let end = hmToMinutes(shift.end);
  const overnight = end <= start;
  if (overnight) end += 1440;
  return { start, end, overnight };
}

export function publishedPayroll(db: Db, period: string) {
  return db.payroll.find((p) => p.period === period);
}

export function payrollRows(db: Db, period: string, today = todayIct()) {
  const published = publishedPayroll(db, period);
  if (published?.status === 'published') {
    const rows = published.slips.map((slip) => {
      const employee = db.employees.find((e) => e.id === slip.employeeId);
      const position = employee ? positionOf(db, employee) : undefined;
      return {
        slip,
        employee,
        position,
        readiness: 'ready' as const,
        issues: [] as string[],
        pendingOt: 0,
        adjustments: slip.adjustments,
        days: slip.days,
        frozen: true,
      };
    });
    return { status: 'published' as const, published, rows };
  }
  const rows = db.employees
    .filter((e) => e.status === 'active')
    .map((employee) => {
      const position = positionOf(db, employee);
      const { days, summary } = buildMonth(db, employee, period, today);
      const slip = buildSlip(db, employee, period, today);
      const issues: string[] = [];
      if (summary.missingDays > 0) issues.push(`${summary.missingDays} ngày thiếu chấm công`);
      if (summary.absenceDays > 0) issues.push(`${summary.absenceDays} ngày vắng`);
      if (summary.otPendingMinutes > 0)
        issues.push(`OT chờ duyệt ${Math.round(summary.otPendingMinutes)} phút`);
      const readiness = issues.length ? ('action' as const) : ('ready' as const);
      return {
        slip,
        employee,
        position,
        readiness,
        issues,
        pendingOt: summary.otPendingMinutes,
        adjustments: summary.adjustments,
        days,
        frozen: false,
      };
    });
  return {
    status: 'open' as const,
    published: undefined,
    rows,
  };
}

export function fmtRange(from: string, to: string): string {
  return `${fmtDateVN(from)} – ${fmtDateVN(to)}`;
}

export function fmtPeriodFull(period: string): string {
  return fmtPeriodVN(period);
}
