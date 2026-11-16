import type {
  Allowance,
  Bonus,
  Company,
  DayResult,
  Employee,
  Holiday,
  Location,
  MonthSummary,
  Payslip,
  Position,
  Punch,
  Request,
  RequestPayload,
  RequestStatus,
  RequestType,
  Schedule,
  Settings,
  Shift,
  Tier,
} from '../../shared/types';

export type {
  Allowance,
  Bonus,
  Company,
  DayResult,
  Employee,
  Holiday,
  Location,
  MonthSummary,
  Payslip,
  Position,
  Punch,
  Request,
  RequestPayload,
  RequestStatus,
  RequestType,
  Schedule,
  Settings,
  Shift,
  Tier,
};

export interface MeResponse {
  employee: Employee;
  company: Company;
  settings: Settings;
  position: Position;
}

export interface LoginResponse extends MeResponse {
  redirect: string;
}

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

export interface WorkbenchData {
  today: string;
  now: string;
  period: string;
  range: { from: string; to: string; days: string[] };
  tasks: AdminTask[];
  counts: Record<string, number>;
  shifts: Shift[];
  kpis: {
    active: number;
    total: number;
    late: number;
    noPunch: number;
    pending: number;
    taskBreakdown: { ot: number; missing: number; absence: number };
  };
}

export interface DispatchRow {
  employee: Employee;
  day: DayResult;
  punches: Punch[];
  shift?: Shift;
  status: 'active' | 'late' | 'after' | 'outside' | 'done' | 'not_in' | 'upcoming';
  lateMinutes: number;
  afterShiftMinutes: number;
  outside: boolean;
  location?: Location;
  lastAt?: string;
  lat?: number;
  lng?: number;
}

export interface DispatchFeedItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  kind: 'in' | 'out';
  at: string;
  workDate: string;
  location?: Location;
  outside: boolean;
  distance?: number;
  lateMinutes: number;
  photo?: string;
  note?: string;
}

export interface DispatchData {
  today: string;
  now: string;
  kpis: {
    active: number;
    notIn: number;
    upcoming: number;
    late: number;
    outside: number;
    total: number;
  };
  rows: DispatchRow[];
  upcoming: DispatchRow[];
  lateRows: DispatchRow[];
  feed: DispatchFeedItem[];
  pins: {
    employeeId: string;
    name: string;
    status: DispatchRow['status'];
    lat: number;
    lng: number;
    at?: string;
    outside: boolean;
    location?: string;
  }[];
  locations: Location[];
}

export interface TimesheetRow {
  employee: Employee;
  position: Position;
  days: DayResult[];
  totals: { cong: number; late: number; missing: number; ot: number; pendingOt: number };
}

export interface TimesheetData {
  from: string;
  to: string;
  dates: string[];
  rows: TimesheetRow[];
  positions: Position[];
  shifts: Shift[];
  holidays: Holiday[];
  today: string;
}

export interface EmployeeDetailData {
  employee: Employee;
  position: Position;
  period: string;
  days: DayResult[];
  summary: MonthSummary;
  requests: Request[];
  punches: Punch[];
  leaveBalance: number;
}

export interface ScheduleRegistration {
  employeeId: string;
  date: string;
  shiftId: string;
  requestId: string;
}

export interface ScheduleData {
  from: string;
  to: string;
  dates: string[];
  today: string;
  employees: Employee[];
  schedules: Schedule[];
  registrations: ScheduleRegistration[];
  shifts: Shift[];
  positions: Position[];
  holidays: Holiday[];
}

export interface PayrollRow {
  slip: Payslip;
  employee?: Employee;
  position?: Position;
  readiness: 'ready' | 'action';
  issues: string[];
  pendingOt: number;
  pendingOtValue: number;
  adjustments: number;
  days: DayResult[];
  frozen: boolean;
}

export interface PayrollData {
  period: string;
  status: 'open' | 'published';
  published?: { period: string; status: string; publishedAt?: string; slips: Payslip[] };
  rows: PayrollRow[];
  bonuses: Bonus[];
  summary: {
    total: number;
    employees: number;
    otMinutes: number;
    otPeople: number;
    pendingOt: number;
    pendingOtValue: number;
    actionRows: number;
    readyRows: number;
  };
  publishedPeriods: { period: string; publishedAt?: string }[];
}

export interface EmployeeListItem extends Employee {
  positionName: string;
  managerName?: string;
  hasDevice: boolean;
}

export interface EmployeesData {
  employees: EmployeeListItem[];
  positions: Position[];
  managers: { id: string; name: string; role: string; positionId: string }[];
}

export interface PositionRow extends Position {
  employeeCount: number;
  shifts: Shift[];
  locations: Location[];
}

export interface PositionsData {
  positions: PositionRow[];
  shifts: Shift[];
  locations: Location[];
}

export interface ShiftRow extends Shift {
  usedBy: string[];
}

export interface ShiftsData {
  shifts: ShiftRow[];
  holidays: Holiday[];
}

export interface LocationsData {
  locations: (Location & { employeeCount: number })[];
  positions: Position[];
}

export interface SettingsData {
  company: Company;
  settings: Settings;
}

export interface EmployeeHomeData {
  today: string;
  now: string;
  employee: Employee;
  position: Position;
  shift: (Shift & { timeLabel: string }) | null;
  day: DayResult;
  punches: Punch[];
  upcoming: DayResult;
  pendingRequests: Request[];
  notifications: NotificationItem[];
  unread: number;
  leaveBalance: number;
  month: { cong: number; lateDays: number; otMinutes: number; absenceDays: number };
  requirePhoto: boolean;
  locations: Location[];
  settings: Settings;
  company: Company;
  device: { id: string; label?: string } | null;
  punchState: 'done' | 'in' | 'leave' | 'out';
  lastPunch?: Punch;
}

export interface EmployeeTimesheetData {
  period: string;
  days: DayResult[];
  summary: MonthSummary;
  leaveBalance: number;
  today: string;
  holidays: Holiday[];
}

export interface EmployeePayslipsData {
  year: number;
  currentPeriod: string;
  months: {
    period: string;
    state: 'published' | 'working' | 'future' | 'none';
    net?: number;
    publishedAt?: string;
    cong?: number;
  }[];
  years: number[];
}

export interface NotificationItem {
  id: string;
  employeeId: string;
  kind: 'payslip' | 'request' | 'system' | 'task';
  title: string;
  body: string;
  at: string;
  read: boolean;
  link?: string;
}

export interface EmployeesAdminResponse {
  employees: (Employee & { positionName: string; managerName?: string; hasDevice?: boolean })[];
  positions: Position[];
  managers: { id: string; name: string; role: string; positionId: string }[];
}

export interface AdminEmployeePayroll {
  employee: Employee;
  position: Position;
  period: string;
  summary: MonthSummary;
  months: { period: string; cong: number; net: number; otMinutes: number }[];
  slip: Payslip | null;
  published: boolean;
}

export interface PunchResponse {
  punch: Punch;
  day: DayResult;
  kind: 'in' | 'out';
  locationName?: string;
  distance: number;
  message: string;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  field?: string;
  [key: string]: unknown;
}
