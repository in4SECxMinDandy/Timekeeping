import type {
  DayResult,
  Employee,
  EngineDayInput,
  Holiday,
  MonthSummary,
  Position,
  Request,
  RequestPayload,
  RequestType,
  Settings,
  Shift,
} from './types';

export const WEEKDAYS = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];
export const WEEKDAYS_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidPeriod(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function fmtYmd(dt: Date): string {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function addDays(s: string, n: number): string {
  const { y, m, d } = parseYmd(s);
  return fmtYmd(new Date(Date.UTC(y, m - 1, d + n)));
}

export function dowOf(s: string): number {
  const { y, m, d } = parseYmd(s);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function todayIct(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function ictParts(now: Date = new Date()): { date: string; time: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  return { date, time, minutes: hmToMinutes(time.slice(0, 5)) };
}

export function nowIctIso(now: Date = new Date()): string {
  const { date, time } = ictParts(now);
  return `${date}T${time}+07:00`;
}

export function monthRange(period: string): { from: string; to: string; days: string[] } {
  const [y, m] = period.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => `${period}-${pad(i + 1)}`);
  return { from: days[0], to: days[days.length - 1], days };
}

export function periodOf(date: string): string {
  return date.slice(0, 7);
}

export function fmtDateVN(date: string, opts?: { short?: boolean }): string {
  if (!isValidDate(date)) return date;
  const [y, m, d] = date.split('-');
  return opts?.short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function fmtPeriodVN(period: string): string {
  const [y, m] = period.split('-');
  return `tháng ${Number(m)}/${y}`;
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  const v = Math.round(Math.abs(n)).toLocaleString('vi-VN');
  return `${sign}${v}đ`;
}

export function fmtMoneyShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs % 1_000_000_000 ? 1 : 0)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs % 1_000_000 ? 1 : 0)}tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function isValidHm(hm: unknown): hm is string {
  return typeof hm === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(hm);
}

export function minutesSince(date: string, iso: string): number {
  const { y, m, d } = parseYmd(date);
  const base = Date.UTC(y, m - 1, d) - ICT_OFFSET_MS;
  return Math.round((Date.parse(iso) - base) / 60000);
}

export function atFromMinutes(date: string, minutes: number): string {
  const { y, m, d } = parseYmd(date);
  const dt = new Date(Date.UTC(y, m - 1, d) + minutes * 60000);
  return `${fmtYmd(dt)}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00+07:00`;
}

export function partyTime(iso?: string): string {
  return iso ? iso.slice(11, 16) : '';
}

export interface ShiftBounds {
  start: number;
  end: number;
  breakStart?: number;
  breakEnd?: number;
  overnight: boolean;
}

export function shiftBounds(shift: Shift): ShiftBounds {
  const start = hmToMinutes(shift.start);
  let end = hmToMinutes(shift.end);
  const overnight = end <= start;
  if (overnight) end += 1440;
  let breakStart: number | undefined;
  let breakEnd: number | undefined;
  if (shift.breakStart && shift.breakEnd) {
    breakStart = hmToMinutes(shift.breakStart);
    breakEnd = hmToMinutes(shift.breakEnd);
    if (breakStart < start) breakStart += 1440;
    if (breakEnd <= breakStart) breakEnd += 1440;
  }
  return { start, end, breakStart, breakEnd, overnight };
}

export function shiftTimeLabel(shift?: Shift): string {
  if (!shift) return '';
  return `${shift.start}–${shift.end}`;
}

export function breakMinutes(shift: Shift): number {
  const b = shiftBounds(shift);
  if (b.breakStart === undefined || b.breakEnd === undefined) return 0;
  return Math.max(0, b.breakEnd - b.breakStart);
}

export function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function otMultiplier(position: Position, weekday: number, isHoliday: boolean): number {
  if (isHoliday) return position.otRates.holiday;
  if (weekday === 7) return position.otRates.sun;
  if (weekday === 6) return position.otRates.satOff;
  return position.otRates.weekday;
}

function emptyResult(i: EngineDayInput): DayResult {
  return {
    date: i.date,
    weekday: i.weekday,
    isToday: i.isToday,
    scheduled: !!i.shift,
    scheduleSource: i.scheduleSource ?? 'base',
    shiftId: i.shift?.id,
    shiftName: i.shift?.name,
    shiftCode: i.shift?.code,
    shiftTime: i.shift ? shiftTimeLabel(i.shift) : undefined,
    status: 'off',
    workedMinutes: 0,
    cong: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    otMinutes: 0,
    approvedOtMinutes: 0,
    pendingOtMinutes: 0,
    otMultiplier: otMultiplier(i.position, i.weekday, !!i.isHoliday),
    outside: false,
    wrongShift: false,
    missingIn: false,
    missingOut: false,
    issues: [],
  };
}

export function computeDay(i: EngineDayInput): DayResult {
  const r = emptyResult(i);
  const sh = i.shift;
  const b = sh ? shiftBounds(sh) : undefined;
  r.holidayName = i.isHoliday?.name;

  if (i.isFuture) {
    r.status = 'future';
    if (i.isHoliday) r.holidayName = i.isHoliday.name;
    return r;
  }

  const sorted = [...i.punches].sort((a, b2) => a.at.localeCompare(b2.at));
  const inPunch = sorted.find((p) => p.kind === 'in');
  const outPunch = [...sorted].reverse().find((p) => p.kind === 'out');
  let inMin = inPunch ? minutesSince(i.date, inPunch.at) : undefined;
  let outMin = outPunch ? minutesSince(i.date, outPunch.at) : undefined;
  if (inMin === undefined && i.forgot?.inTime) inMin = hmToMinutes(i.forgot.inTime);
  if (outMin === undefined && i.forgot?.outTime) outMin = hmToMinutes(i.forgot.outTime);

  if (inMin !== undefined && outMin !== undefined && outMin <= inMin) outMin = undefined;
  if (inPunch) r.inAt = inPunch.at;
  else if (i.forgot?.inTime) r.inAt = atFromMinutes(i.date, hmToMinutes(i.forgot.inTime));
  if (outPunch) r.outAt = outPunch.at;
  else if (i.forgot?.outTime) r.outAt = atFromMinutes(i.date, hmToMinutes(i.forgot.outTime));
  r.inMinutes = inMin;
  r.outMinutes = outMin;
  r.missingIn = inMin === undefined;
  r.missingOut = outMin === undefined;

  const acceptedOutside = !!i.override?.acceptOutside;
  r.outside = sorted.some((p) => p.outside) && !acceptedOutside;
  const acceptedShift = !!i.override?.acceptShift;
  r.wrongShift =
    !!sh && !acceptedShift && sorted.some((p) => p.shiftId && p.shiftId !== sh.id);
  if (i.override?.shiftId && sh && i.override.shiftId !== sh.id) r.wrongShift = false;
  r.overrideNote = i.override?.note;

  const holiday = !!i.isHoliday;
  const hasEvidence = inMin !== undefined || outMin !== undefined;

  const setOt = (raw: number) => {
    const noOt = !!i.override?.noOt;
    r.otMinutes = Math.max(0, Math.round(raw));
    if (i.override?.otMinutes !== undefined) {
      r.approvedOtMinutes = Math.min(r.otMinutes, Math.max(0, i.override.otMinutes));
    } else {
      r.approvedOtMinutes = noOt ? 0 : Math.min(r.otMinutes, Math.max(0, i.approvedOtMinutes));
    }
    r.pendingOtMinutes = noOt
      ? 0
      : Math.max(0, r.otMinutes - r.approvedOtMinutes);
  };

  const workedOf = (a: number, z: number) => {
    let w = Math.max(0, z - a);
    if (b && b.breakStart !== undefined && b.breakEnd !== undefined) {
      w -= overlapMinutes(a, z, b.breakStart, b.breakEnd);
    }
    return Math.max(0, Math.round(w));
  };

  const finishWorked = () => {
    if (inMin === undefined || outMin === undefined) {
      if (i.isToday && inMin !== undefined && outMin === undefined) {
        r.status = 'inprogress';
        return;
      }
      r.status = hasEvidence ? 'missing' : 'absent';
      r.issues.push({ kind: 'missing', note: hasEvidence ? 'Thiếu lần chấm' : 'Chưa chấm công' });
      return;
    }
    const worked = workedOf(inMin, outMin);
    r.workedMinutes = worked;
    if (b) {
      let late = 0;
      let early = 0;
      if (!sh?.noLate) {
        const allowance = sh?.lateAllow ?? 0;
        if (i.settings.lateMode === 'full') {
          late = inMin > b.start + allowance ? inMin - b.start : 0;
        } else {
          late = Math.max(0, inMin - b.start - allowance);
        }
        if (sh) early = Math.max(0, b.end - outMin);
      }
      if (i.waiveLate || i.override?.waiveLate) late = 0;
      if (i.waiveEarly) early = 0;
      r.lateMinutes = Math.max(0, Math.round(late));
      r.earlyMinutes = Math.max(0, Math.round(early));
    }

    if (sh) {
      let cong: number;
      if (sh.calc === 'frame') {
        const full = sh.fullMinutes || Math.round(sh.standardHours * 60);
        const half = sh.halfMinutes || Math.round(full / 2);
        cong = worked >= full ? 1 : worked >= half ? 0.5 : 0;
      } else {
        const standardMin = Math.max(1, (sh.standardHours || 8) * 60);
        cong = round2(Math.min(1, worked / standardMin));
      }
      r.cong = cong;
      let ot = Math.max(0, outMin - b!.end);
      if (i.settings.allowEarlyOT) ot += Math.max(0, b!.start - inMin);
      setOt(ot);
    } else {
      r.cong = 0;
      setOt(worked);
    }

    if (holiday) {
      r.status = 'holiday';
      r.cong = 1;
    } else if (r.lateMinutes > 0) {
      r.status = 'late';
    } else {
      r.status = 'ok';
    }

    if (r.lateMinutes > 0) r.issues.push({ kind: 'late', minutes: r.lateMinutes });
    if (r.earlyMinutes > 0) r.issues.push({ kind: 'early', minutes: r.earlyMinutes });
    if (r.outside) r.issues.push({ kind: 'outside' });
    if (r.wrongShift) r.issues.push({ kind: 'wrong_shift' });
    if (r.otMinutes >= (sh?.otMin ?? i.settings.otMinMinutes) && r.approvedOtMinutes === 0) {
      r.issues.push({ kind: 'ot', minutes: r.otMinutes });
    }
    if (r.missingIn || r.missingOut) {
      r.status = 'missing';
      r.issues.push({ kind: 'missing', note: r.missingIn ? 'Thiếu giờ vào' : 'Thiếu giờ ra' });
    }
  };

  // Ngày lễ: nghỉ vẫn hưởng công, đi làm tính OT toàn bộ thời gian.
  if (holiday) {
    r.holidayName = i.isHoliday?.name;
    if (!hasEvidence) {
      r.status = 'holiday';
      r.cong = 1;
      return r;
    }
    finishWorked();
    if (inMin !== undefined && outMin !== undefined) {
      r.otMinutes = r.workedMinutes;
      const baseOt = i.override?.noOt
        ? 0
        : i.override?.otMinutes !== undefined
          ? Math.max(0, i.override.otMinutes)
          : Math.min(r.workedMinutes, i.approvedOtMinutes);
      r.approvedOtMinutes = Math.min(r.workedMinutes, baseOt);
      r.pendingOtMinutes = i.override?.noOt ? 0 : Math.max(0, r.otMinutes - r.approvedOtMinutes);
      r.issues = r.issues.filter((x) => x.kind !== 'ot');
      if (r.otMinutes >= (i.settings.otMinMinutes || 30) && r.approvedOtMinutes === 0) {
        r.issues.push({ kind: 'ot', minutes: r.otMinutes });
      }
    }
    r.status = 'holiday';
    if (i.override?.cong !== undefined) r.cong = i.override.cong;
    return r;
  }

  // Nghỉ phép đã duyệt.
  if (i.leave && inMin === undefined && !i.punches.length) {
    r.status = 'leave';
    r.leaveKind = i.leave.kind;
    r.cong = i.leave.kind === 'unpaid' ? 0 : i.leave.composite ? 0.5 : 1;
    if (i.override?.cong !== undefined) r.cong = i.override.cong;
    return r;
  }

  // Ngày nghỉ đổi ca đã duyệt.
  if (i.offBySwap && !hasEvidence) {
    r.status = 'off';
    r.cong = 0;
    return r;
  }

  if (!sh) {
    if (!hasEvidence) {
      r.status = 'off';
      return r;
    }
    finishWorked();
    if (r.status === 'ok' || r.status === 'late') r.status = 'ok';
    if (inMin !== undefined && outMin !== undefined && r.otMinutes === 0) {
      setOt(workedOf(inMin, outMin));
    }
    r.issues = r.issues.filter((x) => x.kind !== 'absence');
    return r;
  }

  // Ca có lịch.
  if (inMin === undefined && outMin === undefined && !i.punches.length) {
    const now = i.isToday ? i.nowMinutes : undefined;
    if (b && now !== undefined && now < b.start) {
      r.status = 'future';
      return r;
    }
    if (b && now !== undefined && now < b.end) {
      r.status = 'inprogress';
      return r;
    }
    r.status = 'absent';
    r.cong = 0;
    if (!i.isToday) r.issues.push({ kind: 'absence' });
    if (i.override?.cong !== undefined) {
      r.cong = i.override.cong;
      r.status = 'ok';
    }
    return r;
  }

  finishWorked();

  if (i.override?.cong !== undefined) {
    r.cong = i.override.cong;
    if (r.status === 'missing' || r.status === 'absent') r.status = 'ok';
  }
  if (r.missingIn || r.missingOut) {
    r.issues = r.issues.filter((x) => x.kind !== 'ot');
  }
  if (i.isToday && r.outAt === undefined && inMin !== undefined) r.status = 'inprogress';
  return r;
}

export function baseSalaryOf(employee: Employee, position: Position): number {
  return employee.salaryOverride ?? position.baseSalary;
}

export function hourlyRateOf(employee: Employee, position: Position, shift?: Shift): number {
  const base = baseSalaryOf(employee, position);
  if (position.salaryType === 'hour') return base;
  if (position.salaryType === 'shift') return base / Math.max(1, shift?.standardHours || 8);
  return base / Math.max(1, position.standardDays || 26) / 8;
}

export function summarizeMonth(
  employee: Employee,
  position: Position,
  period: string,
  days: DayResult[],
  adjustments: number,
): MonthSummary {
  const counted = days.filter((d) => d.status !== 'future');
  const cong = round2(counted.reduce((s, d) => s + d.cong, 0));
  const workedMinutes = counted.reduce((s, d) => s + d.workedMinutes, 0);
  const otApprovedMinutes = counted.reduce((s, d) => s + d.approvedOtMinutes, 0);
  const otPendingMinutes = counted.reduce((s, d) => s + d.pendingOtMinutes, 0);
  const base = baseSalaryOf(employee, position);
  const hourly = hourlyRateOf(employee, position);

  let basePay = 0;
  if (position.salaryType === 'month') {
    basePay = (base / Math.max(1, position.standardDays || 26)) * cong;
  } else if (position.salaryType === 'shift') {
    basePay = base * cong;
  } else {
    basePay = (base * workedMinutes) / 60;
  }

  const otWeighted = counted.reduce(
    (s, d) => s + d.approvedOtMinutes * d.otMultiplier,
    0,
  );
  const otPay = (hourly / 60) * otWeighted;

  const paidDays = counted.filter((d) => d.cong > 0).length;
  let allowances = 0;
  const lines: MonthSummary['lines'] = [];
  lines.push({
    label:
      position.salaryType === 'month'
        ? `Lương tháng (${fmtNumber(cong)} công / ${position.standardDays} ngày)`
        : position.salaryType === 'shift'
          ? `Lương theo ca (${fmtNumber(cong)} công)`
          : `Lương theo giờ (${fmtNumber(workedMinutes / 60)} giờ)`,
    amount: Math.round(basePay),
  });
  if (otApprovedMinutes > 0) {
    lines.push({
      label: `Làm thêm giờ (${fmtNumber(otApprovedMinutes / 60)} giờ, đã duyệt)`,
      amount: Math.round(otPay),
    });
  }
  for (const al of position.allowances.filter((a) => a.enabled)) {
    const amount = al.kind === 'month' ? al.amount : al.amount * paidDays;
    allowances += amount;
    lines.push({
      label: `${al.name}${al.kind === 'day' ? ` (${paidDays} ngày)` : ' (cố định)'}`,
      amount: Math.round(amount),
    });
  }
  if (position.fixedBonus > 0) {
    lines.push({ label: 'Thưởng cố định', amount: position.fixedBonus });
  }
  if (adjustments !== 0) {
    lines.push({
      label: adjustments > 0 ? 'Thưởng nhập tay' : 'Phạt / khấu trừ nhập tay',
      amount: Math.round(adjustments),
    });
  }
  const gross = basePay + otPay + allowances + position.fixedBonus + adjustments;
  const insurance = position.insuranceEnabled ? Math.round((basePay + allowances) * 0.105) : 0;
  if (insurance > 0) {
    lines.push({ label: 'Khấu trừ BHXH (10,5%)', amount: -insurance });
  }
  return {
    period,
    cong,
    lateDays: counted.filter((d) => d.lateMinutes > 0).length,
    missingDays: counted.filter((d) => d.status === 'missing').length,
    absenceDays: counted.filter((d) => d.status === 'absent').length,
    leaveDays: counted.filter((d) => d.status === 'leave').length,
    holidayDays: counted.filter((d) => d.holidayName).length,
    workedMinutes,
    otApprovedMinutes,
    otPendingMinutes,
    basePay: Math.round(basePay),
    otPay: Math.round(otPay),
    allowances: Math.round(allowances),
    fixedBonus: position.fixedBonus,
    adjustments,
    insurance,
    gross: Math.round(gross),
    net: Math.round(gross - insurance),
    lines: lines.map((l) => ({ ...l, amount: Math.round(l.amount) })),
  };
}

export function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  leave: 'Đơn nghỉ phép',
  late_early: 'Đi muộn/về sớm',
  ot: 'Đăng ký làm thêm',
  swap: 'Đổi ca',
  register: 'Đăng ký ca',
  forgot: 'Quên chấm công',
  explain: 'Giải trình',
};

export const REQUEST_STATUS_LABEL = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
} as const;

export const DAY_STATUS_LABEL: Record<string, string> = {
  future: 'Chưa tới',
  off: 'Nghỉ',
  holiday: 'Ngày lễ',
  leave: 'Nghỉ phép',
  absent: 'Vắng',
  ok: 'Đủ công',
  late: 'Đi muộn',
  missing: 'Thiếu chấm công',
  inprogress: 'Đang trong ca',
};

export function daySymbol(d: DayResult): string {
  if (d.status === 'holiday') return 'L';
  if (d.status === 'leave') return 'P';
  if (d.status === 'absent') return 'V';
  if (d.status === 'future' || d.status === 'off') return '';
  if (d.status === 'missing') return '!';
  if (d.outside) return 'G';
  if (d.wrongShift) return 'C';
  if (d.cong === 0.5) return '½';
  if (d.lateMinutes > 0 || d.earlyMinutes > 0) return 'M';
  if (d.approvedOtMinutes > 0) return '+';
  if (d.otMinutes > 0) return '+';
  return '';
}

export function requestDuration(req: Request): number {
  const p = req.payload;
  if (p.kind === 'ot') {
    const a = hmToMinutes(p.from);
    const z = hmToMinutes(p.to);
    return z > a ? z - a : z + 1440 - a;
  }
  if (p.kind === 'late_early') return p.minutes;
  return 0;
}

export function requestSummary(req: Request): string {
  const p = req.payload;
  switch (p.kind) {
    case 'leave':
      return `${leaveTypeLabel(p.leaveType)} · ${fmtDateVN(p.from, { short: true })}${p.to !== p.from ? ` → ${fmtDateVN(p.to, { short: true })}` : ''}`;
    case 'late_early':
      return `${p.mode === 'late' ? 'Đi trễ' : 'Về sớm'} ${p.minutes} phút · ${fmtDateVN(p.date, { short: true })}`;
    case 'ot':
      return `Làm thêm ${p.from}–${p.to} · ${fmtDateVN(p.date, { short: true })}`;
    case 'swap':
      return `${fmtDateVN(p.fromDate, { short: true })} → ${fmtDateVN(p.toDate, { short: true })}`;
    case 'register':
      return `${p.dates.length} ngày đăng ký`;
    case 'forgot':
      return `${fmtDateVN(p.date, { short: true })} · ${p.inTime || '—'} → ${p.outTime || '—'}`;
    case 'explain':
      return `${fmtDateVN(p.date, { short: true })} · ${p.reason.slice(0, 48)}`;
  }
}

export function leaveTypeLabel(kind: 'annual' | 'sick' | 'unpaid'): string {
  return kind === 'annual' ? 'Phép năm' : kind === 'sick' ? 'Nghỉ ốm' : 'Không lương';
}

export function validateRequestPayload(payload: RequestPayload): string | null {
  const reason = 'reason' in payload ? payload.reason : '';
  if (typeof reason !== 'string' || reason.trim().length < 5) return 'Vui lòng nhập lý do (ít nhất 5 ký tự).';
  switch (payload.kind) {
    case 'leave': {
      if (!isValidDate(payload.from) || !isValidDate(payload.to)) return 'Ngày nghỉ không hợp lệ.';
      if (payload.from > payload.to) return 'Ngày bắt đầu phải trước ngày kết thúc.';
      if (eachDate(payload.from, payload.to).length > 60) return 'Đơn nghỉ tối đa 60 ngày.';
      if (!['annual', 'sick', 'unpaid'].includes(payload.leaveType)) return 'Loại nghỉ không hợp lệ.';
      return null;
    }
    case 'late_early': {
      if (!isValidDate(payload.date)) return 'Ngày không hợp lệ.';
      if (!Number.isFinite(payload.minutes) || payload.minutes < 1 || payload.minutes > 480)
        return 'Số phút phải trong khoảng 1–480.';
      if (payload.mode !== 'late' && payload.mode !== 'early') return 'Hình thức không hợp lệ.';
      return null;
    }
    case 'ot': {
      if (!isValidDate(payload.date)) return 'Ngày không hợp lệ.';
      if (!isValidHm(payload.from) || !isValidHm(payload.to)) return 'Giờ làm thêm không hợp lệ.';
      if (payload.from === payload.to) return 'Giờ bắt đầu và kết thúc không được trùng nhau.';
      return null;
    }
    case 'swap': {
      if (!isValidDate(payload.fromDate) || !isValidDate(payload.toDate)) return 'Ngày không hợp lệ.';
      if (payload.fromDate === payload.toDate) return 'Ngày nghỉ và ngày đi làm bù phải khác nhau.';
      if (!payload.fromShiftId || !payload.toShiftId) return 'Vui lòng chọn ca.';
      if (payload.fromDate === payload.toDate && payload.fromShiftId === payload.toShiftId)
        return 'Ca đổi phải khác ca ban đầu.';
      return null;
    }
    case 'register': {
      if (!Array.isArray(payload.dates) || payload.dates.length === 0) return 'Chọn ít nhất một ca.';
      if (payload.dates.length > 21) return 'Chỉ đăng ký tối đa 21 ca mỗi đơn.';
      if (payload.dates.some((d) => !isValidDate(d.date) || !d.shiftId)) return 'Ca đăng ký không hợp lệ.';
      return null;
    }
    case 'forgot': {
      if (!isValidDate(payload.date)) return 'Ngày không hợp lệ.';
      if (!payload.shiftId) return 'Vui lòng chọn ca.';
      if (!payload.inTime && !payload.outTime) return 'Nhập ít nhất một mốc giờ bị quên.';
      if (payload.inTime && !isValidHm(payload.inTime)) return 'Giờ vào không hợp lệ.';
      if (payload.outTime && !isValidHm(payload.outTime)) return 'Giờ ra không hợp lệ.';
      if (payload.inTime && payload.outTime && payload.inTime >= payload.outTime)
        return 'Giờ ra phải sau giờ vào.';
      return null;
    }
    case 'explain':
      if (!isValidDate(payload.date)) return 'Ngày không hợp lệ.';
      return null;
  }
}

export function overlappingLeave(
  requests: Request[],
  employeeId: string,
  from: string,
  to: string,
  ignoreId?: string,
): Request | undefined {
  return requests.find((r) => {
    if (r.id === ignoreId || r.employeeId !== employeeId || r.type !== 'leave') return false;
    if (r.status === 'rejected') return false;
    const p = r.payload;
    return p.kind === 'leave' && !(p.to < from || p.from > to);
  });
}

export function usedAnnualLeave(requests: Request[], employeeId: string, year: number): number {
  return requests
    .filter((r) => {
      if (r.employeeId !== employeeId || r.type !== 'leave' || r.status === 'rejected') return false;
      const p = r.payload;
      return p.kind === 'leave' && p.leaveType === 'annual' && Number(p.from.slice(0, 4)) === year;
    })
    .reduce((sum, r) => {
      const p = r.payload as Extract<RequestPayload, { kind: 'leave' }>;
      return sum + eachDate(p.from, p.to).length;
    }, 0);
}

export function holidaySet(holidays: Holiday[]): Map<string, Holiday> {
  return new Map(holidays.map((h) => [h.date, h]));
}

export function minutesToHoursText(min: number): string {
  if (!min) return '0 giờ';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h ? `${h} giờ` : ''}${m ? ` ${m} phút` : ''}`.trim();
}

export function isManagerRole(role: string): boolean {
  return role === 'admin' || role === 'hr' || role === 'manager';
}

export function canSeeEmployee(
  viewer: { id: string; role: string },
  employee: Employee,
  all: Employee[],
): boolean {
  if (viewer.role === 'admin' || viewer.role === 'hr') return true;
  if (viewer.role === 'manager') {
    if (employee.id === viewer.id) return true;
    let cur = employee;
    let guard = 0;
    while (cur.managerId && guard++ < 20) {
      if (cur.managerId === viewer.id) return true;
      const next = all.find((e) => e.id === cur.managerId);
      if (!next) break;
      cur = next;
    }
    return false;
  }
  return viewer.id === employee.id;
}
