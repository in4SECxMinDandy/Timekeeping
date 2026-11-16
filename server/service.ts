import type {
  DayResult,
  Db,
  Employee,
  Payslip,
  Position,
  Punch,
  Request,
  RequestStatus,
  Schedule,
  Shift,
} from '../shared/types';
import {
  addDays,
  DAY_STATUS_LABEL,
  dowOf,
  fmtDateVN,
  fmtMoney,
  fmtPeriodVN,
  hmToMinutes,
  isValidDate,
  isValidPeriod,
  leaveTypeLabel,
  minutesToHm,
  monthRange,
  nowIctIso,
  partyTime,
  periodOf,
  requestDuration,
  requestSummary,
  REQUEST_TYPE_LABEL,
  shiftBounds,
  todayIct,
  WEEKDAYS,
} from '../shared/domain';
import {
  approvedLeaveFor,
  approvedOtMinutes,
  buildDay,
  buildMonth,
  buildSlip,
  effectiveSchedule,
  holidayOf,
  leaveBalance,
  locationOf,
  payrollRows,
  positionOf,
  shiftOf,
} from './compute';

export type TaskKind =
  | 'ot'
  | 'missing'
  | 'absence'
  | 'outside'
  | 'wrong_shift'
  | 'leave'
  | 'other';

export interface AdminTask {
  id: string;
  kind: TaskKind;
  requestId?: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  positionName: string;
  date: string;
  weekday: number;
  shiftId?: string;
  shiftCode?: string;
  shiftName?: string;
  shiftTime?: string;
  summary: string;
  proposal: string;
  minutes?: number;
  cong?: number;
  severity: 'violet' | 'danger' | 'warn' | 'info' | 'sky' | 'slate';
  day: DayResult;
  punches: Punch[];
  request?: Request;
  why: string;
}

function safeEmployee(employee: Employee): Employee {
  return { ...employee, pinHash: '', pinSalt: '' };
}

export function visibleEmployees(actor: Employee, employees: Employee[]): Employee[] {
  if (actor.role === 'admin' || actor.role === 'hr') return employees;
  if (actor.role === 'manager') {
    const direct = new Set<string>([actor.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of employees) {
        if (e.managerId && direct.has(e.managerId) && !direct.has(e.id)) {
          direct.add(e.id);
          changed = true;
        }
      }
    }
    return employees.filter((e) => direct.has(e.id));
  }
  return employees.filter((e) => e.id === actor.id);
}

function punchLabel(d: DayResult): string {
  if (!d.inAt && !d.outAt) return 'Không có lần chấm nào';
  if (d.inAt && !d.outAt) {
    return `Chỉ có giờ vào ${partyTime(d.inAt)}`;
  }
  if (!d.inAt && d.outAt) return `Chỉ có giờ ra ${partyTime(d.outAt)}`;
  return `Vào ${partyTime(d.inAt)} · Ra ${partyTime(d.outAt)}`;
}

function whyFor(
  db: Db,
  task: Pick<AdminTask, 'kind'>,
  day: DayResult,
  punches: Punch[],
  req?: Request,
): string {
  if (req) {
    const base = `${REQUEST_TYPE_LABEL[req.type]}: ${requestSummary(req)}.`;
    return `${base} Nhân viên gửi lúc ${req.createdAt.slice(11, 16)} ngày ${fmtDateVN(req.createdAt.slice(0, 10))}.`;
  }
  switch (task.kind) {
    case 'ot':
      return `Giờ ra ${day.outAt ? partyTime(day.outAt) : '—'} vượt giờ kết thúc ca ${day.shiftTime?.split('–')[1] ?? ''} là ${day.otMinutes} phút. Ngưỡng tối thiểu ${day.otMinutes >= 30 ? '30' : '—'} phút đã đạt.`;
    case 'missing':
      return `${punchLabel(day)}. Hệ thống không đủ cặp giờ vào/ra để tính công.`;
    case 'absence':
      return `Có ca ${day.shiftName ?? ''} (${day.shiftTime ?? ''}) nhưng không có lần chấm công nào.`;
    case 'outside': {
      const p = punches.find((x) => x.outside);
      const loc = p?.locationId ? locationOf(db, p.locationId) : undefined;
      const near = loc ? loc.name : 'địa điểm làm việc';
      return p?.distance
        ? `Lần chấm cách ${near} ${(p.distance / 1000).toFixed(1)} km, ngoài bán kính cho phép.`
        : 'Lần chấm nằm ngoài bán kính địa điểm cho phép.';
    }
    case 'wrong_shift': {
      const p = punches.find((x) => x.shiftId && x.shiftId !== day.shiftId);
      const matched = shiftOf(db, p?.shiftId);
      return matched
        ? `Giờ chấm khớp ca ${matched.code} (${matched.start}–${matched.end}) hơn ca đã xếp ${day.shiftCode ?? ''}.`
        : 'Giờ chấm không khớp ca đã xếp.';
    }
    case 'leave':
      return 'Đơn nghỉ phép đang chờ quản lý phản hồi.';
    default:
      return 'Cần quản lý xem xét và phản hồi.';
  }
}

export function buildTasks(
  db: Db,
  actor: Employee,
  today = todayIct(),
): AdminTask[] {
  const employees = visibleEmployees(actor, db.employees).filter((e) => e.status === 'active');
  const startDate = addDays(today, -13);
  const tasks = new Map<string, AdminTask>();
  const pendingRequests = db.requests.filter(
    (r) => r.status === 'pending' && employees.some((e) => e.id === r.employeeId),
  );
  const pendingOtKeys = new Set(
    pendingRequests
      .filter((r) => r.type === 'ot' && r.payload.kind === 'ot')
      .map((r) => `${r.employeeId}:${(r.payload as { date: string }).date}`),
  );

  for (const employee of employees) {
    const position = positionOf(db, employee);
    for (let i = 0; i < 14; i++) {
      const date = addDays(startDate, i);
      if (date > today) break;
      if (date === today) continue;
      const day = buildDay(db, employee, date, today);
      if (!day.issues.length) continue;
      const punches = db.punches.filter(
        (p) => p.employeeId === employee.id && p.workDate === date,
      );
      const check = (kind: TaskKind) => {
        const id = `${kind}:${employee.id}:${date}`;
        if (tasks.has(id)) return false;
        return true;
      };
      for (const issue of day.issues) {
        if (issue.kind === 'late' || issue.kind === 'early' || issue.kind === 'no_punch') continue;
        if (issue.kind === 'ot') {
          if (pendingOtKeys.has(`${employee.id}:${date}`)) continue;
          const id = `ot:${employee.id}:${date}`;
          if (!check('ot')) continue;
          tasks.set(id, {
            id,
            kind: 'ot',
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: employee.code,
            positionName: position.name,
            date,
            weekday: dowOf(date),
            shiftId: day.shiftId,
            shiftCode: day.shiftCode,
            shiftName: day.shiftName,
            shiftTime: day.shiftTime,
            summary: `Ra ca ${day.outAt ? partyTime(day.outAt) : '—'} · sau ca ${day.otMinutes} phút`,
            proposal: `Đề xuất cộng ${day.otMinutes} phút làm thêm`,
            minutes: day.otMinutes,
            severity: 'violet',
            day,
            punches,
            why: whyFor(db, { kind: 'ot' }, day, punches),
          });
        } else if (issue.kind === 'missing') {
          if (!check('missing')) continue;
          tasks.set(`missing:${employee.id}:${date}`, {
            id: `missing:${employee.id}:${date}`,
            kind: 'missing',
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: employee.code,
            positionName: position.name,
            date,
            weekday: dowOf(date),
            shiftId: day.shiftId,
            shiftCode: day.shiftCode,
            shiftName: day.shiftName,
            shiftTime: day.shiftTime,
            summary: day.inAt ? `Chỉ có giờ vào ${partyTime(day.inAt)}` : 'Thiếu giờ vào',
            proposal: 'Duyệt công nếu xác nhận có làm việc',
            cong: 1,
            severity: 'danger',
            day,
            punches,
            why: whyFor(db, { kind: 'missing' }, day, punches),
          });
        } else if (issue.kind === 'absence') {
          if (!check('absence')) continue;
          tasks.set(`absence:${employee.id}:${date}`, {
            id: `absence:${employee.id}:${date}`,
            kind: 'absence',
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: employee.code,
            positionName: position.name,
            date,
            weekday: dowOf(date),
            shiftId: day.shiftId,
            shiftCode: day.shiftCode,
            shiftName: day.shiftName,
            shiftTime: day.shiftTime,
            summary: `Không có lần chấm nào · ca ${day.shiftCode ?? ''}`,
            proposal: 'Ghi nhận vắng hoặc cộng công nếu có căn cứ',
            severity: 'danger',
            day,
            punches,
            why: whyFor(db, { kind: 'absence' }, day, punches),
          });
        } else if (issue.kind === 'outside') {
          if (!check('outside')) continue;
          const p = punches.find((x) => x.outside);
          tasks.set(`outside:${employee.id}:${date}`, {
            id: `outside:${employee.id}:${date}`,
            kind: 'outside',
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: employee.code,
            positionName: position.name,
            date,
            weekday: dowOf(date),
            shiftId: day.shiftId,
            shiftCode: day.shiftCode,
            shiftName: day.shiftName,
            shiftTime: day.shiftTime,
            summary: p?.distance
              ? `Cách địa điểm ${(p.distance / 1000).toFixed(1)} km`
              : 'Chấm ngoài vùng cho phép',
            proposal: 'Chấp nhận vị trí chấm công',
            severity: 'warn',
            day,
            punches,
            why: whyFor(db, { kind: 'outside' }, day, punches),
          });
        } else if (issue.kind === 'wrong_shift') {
          if (!check('wrong_shift')) continue;
          tasks.set(`wrong_shift:${employee.id}:${date}`, {
            id: `wrong_shift:${employee.id}:${date}`,
            kind: 'wrong_shift',
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: employee.code,
            positionName: position.name,
            date,
            weekday: dowOf(date),
            shiftId: day.shiftId,
            shiftCode: day.shiftCode,
            shiftName: day.shiftName,
            shiftTime: day.shiftTime,
            summary: `Giờ chấm không khớp ca ${day.shiftCode ?? ''}`,
            proposal: `Xác nhận ca ${day.shiftCode ?? ''}`,
            severity: 'info',
            day,
            punches,
            why: whyFor(db, { kind: 'wrong_shift' }, day, punches),
          });
        }
      }
    }
  }

  for (const req of pendingRequests) {
    const employee = employees.find((e) => e.id === req.employeeId)!;
    const position = positionOf(db, employee);
    const p = req.payload;
    let date = today;
    if (p.kind === 'leave') date = p.from;
    else if ('date' in p) date = p.date;
    else if (p.kind === 'swap') date = p.fromDate;
    else if (p.kind === 'register') date = p.dates[0]?.date ?? today;
    const kind: TaskKind =
      req.type === 'leave' ? 'leave' : req.type === 'ot' ? 'ot' : 'other';
    if (req.type === 'ot' && pendingOtKeys.has(`${employee.id}:${date}`)) {
      const existing = tasks.get(`ot:${employee.id}:${date}`);
      if (existing) {
        tasks.delete(existing.id);
        existing.id = `request:${req.id}`;
        existing.requestId = req.id;
        existing.request = req;
        existing.punches = db.punches.filter(
          (x) => x.employeeId === employee.id && x.workDate === date,
        );
        existing.why = whyFor(db, { kind: 'ot' }, existing.day, existing.punches, req);
        tasks.set(existing.id, existing);
        continue;
      }
    }
    const day = buildDay(db, employee, date, today);
    const punches = db.punches.filter(
      (x) => x.employeeId === employee.id && x.workDate === date,
    );
    const duration = requestDuration(req);
    const shift =
      (p.kind === 'ot' && shiftOf(db, p.shiftId)) ||
      (p.kind === 'late_early' ? shiftOf(db, p.shiftId) : undefined) ||
      shiftOf(db, day.shiftId);
    let summary = requestSummary(req);
    if (req.type === 'leave' && p.kind === 'leave') {
      summary = `${leaveTypeLabel(p.leaveType)} · ${p.from === p.to ? fmtDateVN(p.from) : `${fmtDateVN(p.from)} → ${fmtDateVN(p.to)}`}`;
    }
    if (req.type === 'ot' && p.kind === 'ot') {
      summary = `Làm thêm ${p.from}–${p.to} · ${duration} phút`;
    }
    const task: AdminTask = {
      id: `request:${req.id}`,
      kind,
      requestId: req.id,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeCode: employee.code,
      positionName: position.name,
      date,
      weekday: dowOf(date),
      shiftId: shift?.id ?? day.shiftId,
      shiftCode: shift?.code ?? day.shiftCode,
      shiftName: shift?.name ?? day.shiftName,
      shiftTime: shift ? `${shift.start}–${shift.end}` : day.shiftTime,
      summary,
      proposal:
        kind === 'leave'
          ? `Duyệt ${p.kind === 'leave' ? leaveTypeLabel(p.leaveType).toLowerCase() : 'đơn'}`
          : kind === 'ot'
            ? `Duyệt ${duration} phút làm thêm`
            : 'Xem và phản hồi đơn',
      minutes: kind === 'ot' ? duration : undefined,
      severity: kind === 'leave' ? 'sky' : kind === 'ot' ? 'violet' : 'slate',
      day,
      punches,
      request: req,
      why: whyFor(db, { kind }, day, punches, req),
    };
    tasks.set(task.id, task);
  }

  return [...tasks.values()]
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const weight: Record<TaskKind, number> = {
        leave: 0,
        ot: 1,
        other: 2,
        missing: 3,
        absence: 4,
        outside: 5,
        wrong_shift: 6,
      };
      return weight[a.kind] - weight[b.kind];
    })
    .slice(0, 60);
}

export function taskCounts(tasks: AdminTask[]): Record<string, number> {
  const counts: Record<string, number> = {
    all: tasks.length,
    ot: 0,
    missing: 0,
    absence: 0,
    outside: 0,
    wrong_shift: 0,
    leave: 0,
    other: 0,
  };
  for (const t of tasks) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
  return counts;
}

function todayRows(db: Db, employees: Employee[], today: string) {
  return employees.map((employee) => {
    const day = buildDay(db, employee, today, today);
    const punches = db.punches
      .filter((p) => p.employeeId === employee.id && p.workDate === today)
      .sort((a, b) => a.at.localeCompare(b.at));
    const shift = shiftOf(db, day.shiftId);
    return { employee, day, punches, shift };
  });
}

export function workbenchData(db: Db, actor: Employee) {
  const today = todayIct();
  const now = nowIctIso();
  const employees = visibleEmployees(actor, db.employees).filter((e) => e.status === 'active');
  const tasks = buildTasks(db, actor, today);
  const rows = todayRows(db, employees, today);
  const active = rows.filter((r) => {
    const hasIn = r.punches.some((p) => p.kind === 'in');
    const hasOut = r.punches.some((p) => p.kind === 'out');
    return hasIn && !hasOut;
  }).length;
  const late = rows.filter((r) => r.day.lateMinutes > 0).length;
  const nowMinutes = hmToMinutes(now.slice(11, 16));
  const noPunch = rows.filter((r) => {
    if (!r.day.scheduled || r.day.status === 'leave' || r.day.holidayName) return false;
    if (r.punches.length) return false;
    const start = r.shift ? hmToMinutes(r.shift.start) : 0;
    return nowMinutes > start + 15;
  }).length;
  const counts = taskCounts(tasks);
  const currentPeriod = periodOf(today);
  const range = monthRange(currentPeriod);
  const pending = db.requests.filter(
    (r) => r.status === 'pending' && employees.some((e) => e.id === r.employeeId),
  ).length;
  return {
    today,
    now,
    period: currentPeriod,
    range,
    tasks,
    counts,
    shifts: db.shifts,
    kpis: {
      active,
      total: employees.length,
      late,
      noPunch,
      pending,
      taskBreakdown: {
        ot: counts.ot,
        missing: counts.missing,
        absence: counts.absence,
      },
    },
  };
}

export function dispatchData(db: Db, actor: Employee) {
  const today = todayIct();
  const now = nowIctIso();
  const nowMinutes = hmToMinutes(now.slice(11, 16));
  const employees = visibleEmployees(actor, db.employees).filter((e) => e.status === 'active');
  const rows = todayRows(db, employees, today)
    .filter((r) => r.day.scheduled || r.punches.length)
    .map(({ employee, day, punches, shift }) => {
      const hasIn = punches.some((p) => p.kind === 'in');
      const hasOut = punches.some((p) => p.kind === 'out');
      const start = shift ? hmToMinutes(shift.start) : 0;
      const end = shift ? hmToMinutes(shift.end) : 0;
      const afterShift = hasIn && !hasOut && nowMinutes > end + 5;
      const outside = punches.some((p) => p.outside) && day.outside;
      let status: 'active' | 'late' | 'after' | 'outside' | 'done' | 'not_in' | 'upcoming' =
        'not_in';
      if (hasOut) status = 'done';
      else if (afterShift) status = 'after';
      else if (day.lateMinutes > 0 && hasIn) status = 'late';
      else if (hasIn) status = 'active';
      else if (start > nowMinutes) status = 'upcoming';
      if (outside && status !== 'done') status = 'outside';
      const latest = [...punches].reverse()[0];
      return {
        employee: safeEmployee(employee),
        day,
        punches,
        shift,
        status,
        lateMinutes: day.lateMinutes,
        afterShiftMinutes: afterShift ? nowMinutes - end : 0,
        outside,
        location: latest?.locationId ? locationOf(db, latest.locationId) : undefined,
        lastAt: latest?.at,
        lat: latest?.lat,
        lng: latest?.lng,
      };
    });

  const active = rows.filter((r) => r.punches.some((p) => p.kind === 'in') && !r.punches.some((p) => p.kind === 'out')).length;
  const notIn = rows.filter((r) => !r.punches.length && r.shift && nowMinutes > hmToMinutes(r.shift.start)).length;
  const upcoming = rows
    .filter(
      (r) =>
        !r.punches.length &&
        r.shift &&
        hmToMinutes(r.shift.start) > nowMinutes &&
        hmToMinutes(r.shift.start) <= nowMinutes + 360,
    )
    .sort((a, b) => hmToMinutes(a.shift!.start) - hmToMinutes(b.shift!.start));
  const late = rows.filter((r) => r.lateMinutes > 0).length;
  const outside = rows.filter((r) => r.outside).length;
  const attention = rows.filter(
    (r) =>
      r.status === 'late' ||
      r.status === 'outside' ||
      r.status === 'after' ||
      (r.status === 'not_in' && r.shift && nowMinutes > hmToMinutes(r.shift.start) + 15),
  );

  const feed = db.punches
    .filter((p) => employees.some((e) => e.id === p.employeeId))
    .filter((p) => p.workDate === today || p.workDate === addDays(today, -1))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40)
    .map((p) => {
      const employee = employees.find((e) => e.id === p.employeeId)!;
      const day = buildDay(db, employee, p.workDate, today);
      return {
        id: p.id,
        employeeId: p.employeeId,
        employeeName: employee.name,
        employeeCode: employee.code,
        kind: p.kind,
        at: p.at,
        workDate: p.workDate,
        location: p.locationId ? locationOf(db, p.locationId) : undefined,
        outside: p.outside,
        distance: p.distance,
        lateMinutes: p.kind === 'in' ? day.lateMinutes : 0,
        photo: p.photo,
        note: p.note,
      };
    });

  const pins = rows
    .filter((r) => r.lat !== undefined && r.lng !== undefined)
    .map((r) => ({
      employeeId: r.employee.id,
      name: r.employee.name,
      status: r.status,
      lat: r.lat!,
      lng: r.lng!,
      at: r.lastAt,
      outside: r.outside,
      location: r.location?.name,
    }));

  return {
    today,
    now,
    kpis: {
      active,
      notIn,
      upcoming: upcoming.length,
      late,
      outside,
      total: rows.length,
    },
    rows,
    upcoming,
    lateRows: attention,
    feed,
    pins,
    locations: db.locations,
  };
}

export function timesheetData(
  db: Db,
  actor: Employee,
  from: string,
  to: string,
) {
  const today = todayIct();
  const start = isValidDate(from) ? from : `${periodOf(today)}-01`;
  const end = isValidDate(to) ? to : monthRange(periodOf(today)).to;
  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard++ < 62) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const employees = visibleEmployees(actor, db.employees);
  const rows = employees.map((employee) => {
    const position = positionOf(db, employee);
    const days = dates.map((date) => buildDay(db, employee, date, today));
    return {
      employee: safeEmployee(employee),
      position,
      days,
      totals: {
        cong: Math.round(days.reduce((s, d) => s + d.cong, 0) * 100) / 100,
        late: days.filter((d) => d.lateMinutes > 0).length,
        missing: days.filter((d) => d.status === 'missing').length,
        ot: days.reduce((s, d) => s + d.approvedOtMinutes, 0),
        pendingOt: days.reduce((s, d) => s + d.pendingOtMinutes, 0),
      },
    };
  });
  return {
    from: start,
    to: end,
    dates,
    rows,
    positions: db.positions,
    shifts: db.shifts,
    holidays: db.holidays,
    today,
  };
}

export function employeeDetail(db: Db, actor: Employee, employeeId: string, period: string) {
  const employees = visibleEmployees(actor, db.employees);
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return null;
  const position = positionOf(db, employee);
  const safePeriod = isValidPeriod(period) ? period : periodOf(todayIct());
  const { days, summary } = buildMonth(db, employee, safePeriod);
  const requests = db.requests
    .filter((r) => r.employeeId === employee.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  const punches = db.punches
    .filter(
      (p) =>
        p.employeeId === employee.id &&
        (!first || !last || (p.workDate >= first && p.workDate <= last)),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  return {
    employee: safeEmployee(employee),
    position,
    period: safePeriod,
    days,
    summary,
    requests,
    punches,
    leaveBalance: leaveBalance(db, employee, Number(periodOf(todayIct()).slice(0, 4))),
  };
}

export function scheduleData(
  db: Db,
  actor: Employee,
  from: string,
  to: string,
) {
  const today = todayIct();
  const start = isValidDate(from) ? from : today;
  const end = isValidDate(to) ? to : addDays(start, 6);
  const employees = visibleEmployees(actor, db.employees);
  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard++ < 40) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const schedules = db.schedules.filter(
    (s) => s.date >= start && s.date <= end && employees.some((e) => e.id === s.employeeId),
  );
  const registrations: {
    employeeId: string;
    date: string;
    shiftId: string;
    requestId: string;
  }[] = [];
  for (const r of db.requests) {
    if (r.status !== 'approved' || r.type !== 'register') continue;
    if (!employees.some((e) => e.id === r.employeeId)) continue;
    if (r.payload.kind !== 'register') continue;
    for (const d of r.payload.dates) {
      if (d.date >= start && d.date <= end) {
        registrations.push({
          employeeId: r.employeeId,
          date: d.date,
          shiftId: d.shiftId,
          requestId: r.id,
        });
      }
    }
  }
  return {
    from: start,
    to: end,
    dates,
    today,
    employees: employees.map((e) => ({ ...e, pinHash: '', pinSalt: '' })),
    schedules,
    registrations,
    shifts: db.shifts,
    positions: db.positions,
    holidays: db.holidays,
  };
}

export function payrollData(db: Db, actor: Employee, period: string) {
  const safePeriod = isValidPeriod(period) ? period : periodOf(todayIct());
  const data = payrollRows(db, safePeriod);
  const rows = data.rows
    .filter((r) => r.employee && visibleEmployees(actor, db.employees).some((e) => e.id === r.employee!.id))
    .map((r) => {
      const safeRow = { ...r, employee: r.employee ? safeEmployee(r.employee) : undefined };
      const hourly =
        r.slip.salaryType === 'hour'
          ? r.slip.baseSalary
          : r.slip.salaryType === 'shift'
            ? r.slip.baseSalary / 8
            : r.slip.baseSalary / Math.max(1, r.slip.standardDays) / 8;
      return {
        ...safeRow,
        pendingOtValue: Math.round((hourly / 60) * (r.pendingOt || 0) * 1.5),
      };
    });
  const total = rows.reduce((s, r) => s + r.slip.net, 0);
  const otMinutes = rows.reduce((s, r) => s + r.slip.otMinutes, 0);
  const otPeople = rows.filter((r) => r.slip.otMinutes > 0).length;
  const pendingOt = rows.reduce((s, r) => s + (r.pendingOt || 0), 0);
  const pendingOtValue = rows.reduce((s, r) => s + r.pendingOtValue, 0);
  const actionRows = rows.filter((r) => r.readiness !== 'ready').length;
  const readyRows = rows.length - actionRows;
  const publishedPeriods = db.payroll
    .filter((p) => p.status === 'published')
    .map((p) => ({
      period: p.period,
      publishedAt: p.publishedAt,
    }))
    .sort((a, b) => b.period.localeCompare(a.period));
  return {
    period: safePeriod,
    status: data.status,
    published: data.published,
    rows,
    bonuses: db.bonuses.filter((b) => b.period === safePeriod),
    summary: {
      total,
      employees: rows.length,
      otMinutes,
      otPeople,
      pendingOt,
      pendingOtValue,
      actionRows,
      readyRows,
    },
    publishedPeriods,
  };
}

export function employeeHome(db: Db, employee: Employee) {
  const today = todayIct();
  const now = nowIctIso();
  const position = positionOf(db, employee);
  const shift = effectiveSchedule(db, employee, today).shift;
  const day = buildDay(db, employee, today, today);
  const punches = db.punches
    .filter((p) => p.employeeId === employee.id && p.workDate === today)
    .sort((a, b) => a.at.localeCompare(b.at));
  const upcomingToday = buildDay(db, employee, addDays(today, 1), today);
  const pendingRequests = db.requests
    .filter((r) => r.employeeId === employee.id && r.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notifications = db.notifications
    .filter((n) => n.employeeId === employee.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);
  const unread = db.notifications.filter((n) => n.employeeId === employee.id && !n.read).length;
  const { summary } = buildMonth(db, employee, periodOf(today), today);
  const todayLeave = approvedLeaveFor(db, employee.id, today);
  const locations = db.locations.filter((l) =>
    (employee.locationOverrideIds ?? position.locationIds).includes(l.id),
  );
  const requirePhoto =
    employee.photoPolicy === 'required' ||
    (employee.photoPolicy !== 'exempt' && !position.photoExempt && db.settings.requirePhoto);
  const hasIn = punches.some((p) => p.kind === 'in');
  const hasOut = punches.some((p) => p.kind === 'out');
  const lastPunch = [...punches].reverse()[0];
  return {
    today,
    now,
    employee: { ...employee, pinHash: '', pinSalt: '' },
    position,
    shift: shift ? { ...shift, timeLabel: `${shift.start}–${shift.end}` } : null,
    day,
    punches,
    upcoming: upcomingToday,
    pendingRequests,
    notifications,
    unread,
    leaveBalance: leaveBalance(db, employee, Number(today.slice(0, 4))),
    month: {
      cong: summary.cong,
      lateDays: summary.lateDays,
      otMinutes: summary.otApprovedMinutes,
      absenceDays: summary.absenceDays,
    },
    requirePhoto,
    locations,
    settings: db.settings,
    company: db.company,
    device: employee.deviceId ? { id: employee.deviceId, label: employee.deviceLabel } : null,
    punchState: hasOut ? 'done' : hasIn ? 'in' : todayLeave ? 'leave' : 'out',
    lastPunch,
  };
}

export function employeeTimesheet(db: Db, employee: Employee, period: string) {
  const safe = isValidPeriod(period) ? period : periodOf(todayIct());
  const { days, summary } = buildMonth(db, employee, safe);
  return {
    period: safe,
    days,
    summary,
    leaveBalance: leaveBalance(db, employee, Number(safe.slice(0, 4))),
    today: todayIct(),
    holidays: db.holidays,
  };
}

export function employeeScheduleData(
  db: Db,
  employee: Employee,
  from: string,
  to: string,
) {
  const data = scheduleData(db, employee, from, to);
  return {
    ...data,
    employees: data.employees.filter((e) => e.id === employee.id),
    schedules: data.schedules.filter((s) => s.employeeId === employee.id),
    registrations: data.registrations.filter((r) => r.employeeId === employee.id),
  };
}

export function employeePayslips(db: Db, employee: Employee, year: number) {
  const currentPeriod = periodOf(todayIct());
  const y = Number.isFinite(year) ? year : Number(currentPeriod.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) => {
    const period = `${y}-${String(i + 1).padStart(2, '0')}`;
    const published = db.payroll.find((p) => p.period === period && p.status === 'published');
    const slip = published?.slips.find((s) => s.employeeId === employee.id);
    const state = slip
      ? 'published'
      : period === currentPeriod
        ? 'working'
        : period > currentPeriod
          ? 'future'
          : 'none';
    return {
      period,
      state,
      net: slip?.net,
      publishedAt: published?.publishedAt,
      cong: slip?.cong,
    };
  });
  return {
    year: y,
    currentPeriod,
    months,
    years: Array.from(
      new Set([
        Number(currentPeriod.slice(0, 4)),
        ...db.payroll.map((p) => Number(p.period.slice(0, 4))),
      ]),
    ).sort((a, b) => b - a),
  };
}

export function payslipFor(db: Db, employee: Employee, period: string): Payslip | null {
  const published = db.payroll.find((p) => p.period === period && p.status === 'published');
  return published?.slips.find((s) => s.employeeId === employee.id) ?? null;
}

export function employeeRequests(db: Db, employee: Employee) {
  return db.requests
    .filter((r) => r.employeeId === employee.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function adminEmployeeSummary(db: Db, employee: Employee, period: string) {
  const { summary } = buildMonth(db, employee, period);
  const current = periodOf(todayIct());
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 1 - i, 1));
    const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const { summary: s } = buildMonth(db, employee, p);
    return { period: p, cong: s.cong, net: s.net, otMinutes: s.otApprovedMinutes };
  });
  return { summary, months };
}

export function notify(
  db: Db,
  employeeId: string,
  kind: 'payslip' | 'request' | 'system' | 'task',
  title: string,
  body: string,
  link?: string,
) {
  db.notifications.unshift({
    id: `nt${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    employeeId,
    kind,
    title,
    body,
    at: nowIctIso(),
    read: false,
    link,
  });
}

export function publishPayroll(
  db: Db,
  period: string,
  actor: Employee,
): { count: number; total: number } {
  const today = todayIct();
  const slips = db.employees
    .filter((e) => e.status === 'active')
    .map((e) => buildSlip(db, e, period, today, nowIctIso()));
  const total = slips.reduce((s, x) => s + x.net, 0);
  const existing = db.payroll.find((p) => p.period === period);
  if (existing) {
    existing.status = 'published';
    existing.publishedAt = nowIctIso();
    existing.publishedBy = actor.id;
    existing.slips = slips;
  } else {
    db.payroll.push({
      period,
      status: 'published',
      publishedAt: nowIctIso(),
      publishedBy: actor.id,
      slips,
    });
  }
  for (const slip of slips) {
    notify(
      db,
      slip.employeeId,
      'payslip',
      `Phiếu lương ${fmtPeriodVN(period)} đã công bố`,
      `Thực lĩnh ${fmtMoney(slip.net)}. Xem chi tiết trong mục Lương.`,
      '/m/luong',
    );
  }
  return { count: slips.length, total };
}

export function revokePayroll(db: Db, period: string): void {
  const existing = db.payroll.find((p) => p.period === period);
  if (existing) {
    existing.status = 'open';
    existing.slips = [];
    existing.publishedAt = undefined;
  }
}

export function requestLabel(req: Request): string {
  return REQUEST_TYPE_LABEL[req.type];
}

export function requestStatusLabel(status: RequestStatus): string {
  return status === 'pending' ? 'Chờ duyệt' : status === 'approved' ? 'Đã duyệt' : 'Từ chối';
}

export function safeSchedulePreview(db: Db, employee: Employee, from: string, to: string) {
  const schedules = db.schedules.filter(
    (s) => s.employeeId === employee.id && s.date >= from && s.date <= to,
  );
  return schedules.map((s) => {
    const shift = shiftOf(db, s.shiftId);
    return {
      ...s,
      shiftName: shift?.name,
      shiftCode: shift?.code,
      shiftTime: shift ? `${shift.start}–${shift.end}` : '',
    };
  });
}

export function dayLabel(d: DayResult): string {
  return DAY_STATUS_LABEL[d.status] ?? d.status;
}
