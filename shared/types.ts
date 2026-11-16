export type Role = 'admin' | 'hr' | 'manager' | 'employee';
export type SalaryType = 'month' | 'shift' | 'hour';
export type ShiftCalc = 'frame' | 'actual' | 'actual_late';
export type RequestType = 'leave' | 'late_early' | 'ot' | 'swap' | 'register' | 'forgot' | 'explain';
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type DayStatus =
  | 'future'
  | 'off'
  | 'holiday'
  | 'leave'
  | 'absent'
  | 'ok'
  | 'late'
  | 'missing'
  | 'inprogress';

export interface Company {
  name: string;
  code: string;
  address: string;
  appName: string;
  brandColor: string;
  logoUrl?: string;
}

export interface Settings {
  workdays: number[];
  lateMode: 'full' | 'excess';
  allowEarlyOT: boolean;
  autoOtFromRequest: boolean;
  otMinMinutes: number;
  requirePhoto: boolean;
  payCloseDay: number;
  payrollEnabled: boolean;
  sheetUrl?: string;
  driveUrl?: string;
  lateExplain: boolean;
}

export interface Tier {
  id: string;
  name: string;
  amount: number;
  headcount: number;
}

export interface Allowance {
  id: string;
  name: string;
  amount: number;
  kind: 'day' | 'month';
  enabled: boolean;
}

export interface Position {
  id: string;
  name: string;
  salaryType: SalaryType;
  baseSalary: number;
  tiers: Tier[];
  flexible: boolean;
  shiftIds: string[];
  workdays?: number[];
  leaveDays: number;
  standardDays: number;
  allowances: Allowance[];
  fixedBonus: number;
  penaltiesEnabled: boolean;
  insuranceEnabled: boolean;
  otRates: { weekday: number; satOff: number; sun: number; holiday: number };
  photoExempt: boolean;
  locationIds: string[];
  anywhere: boolean;
  note?: string;
  headcountWanted?: number;
}

export interface Shift {
  id: string;
  name: string;
  code: string;
  start: string;
  end: string;
  breakStart?: string;
  breakEnd?: string;
  calc: ShiftCalc;
  standardHours: number;
  fullMinutes: number;
  halfMinutes: number;
  lateAllow: number;
  otMin: number;
  composite: boolean;
  noLate: boolean;
  note?: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius: number;
  positionIds: string[];
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export type PhotoPolicy = 'company' | 'required' | 'exempt';

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string;
  pinHash: string;
  pinSalt: string;
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
  photoPolicy: PhotoPolicy;
  deviceId?: string;
  deviceLabel?: string;
  createdAt: string;
}

export interface Schedule {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string;
  status: 'scheduled' | 'registered';
  note?: string;
}

export interface Punch {
  id: string;
  employeeId: string;
  workDate: string;
  shiftId?: string;
  at: string;
  kind: 'in' | 'out';
  lat?: number;
  lng?: number;
  accuracy?: number;
  locationId?: string;
  outside: boolean;
  distance?: number;
  photo?: string;
  note?: string;
}

export type RequestPayload =
  | { kind: 'leave'; leaveType: 'annual' | 'sick' | 'unpaid'; from: string; to: string; reason: string }
  | {
      kind: 'late_early';
      mode: 'late' | 'early';
      date: string;
      minutes: number;
      shiftId?: string;
      reason: string;
    }
  | { kind: 'ot'; date: string; shiftId: string; from: string; to: string; reason: string }
  | {
      kind: 'swap';
      fromDate: string;
      fromShiftId: string;
      toDate: string;
      toShiftId: string;
      reason: string;
    }
  | { kind: 'register'; dates: { date: string; shiftId: string }[]; reason: string }
  | {
      kind: 'forgot';
      date: string;
      shiftId: string;
      inTime?: string;
      outTime?: string;
      reason: string;
    }
  | { kind: 'explain'; date: string; shiftId?: string; reason: string };

export interface Request {
  id: string;
  employeeId: string;
  type: RequestType;
  status: RequestStatus;
  payload: RequestPayload;
  note?: string;
  decisionNote?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface DayOverride {
  id: string;
  employeeId: string;
  date: string;
  cong?: number;
  otMinutes?: number;
  noOt?: boolean;
  acceptOutside?: boolean;
  acceptShift?: boolean;
  waiveLate?: boolean;
  shiftId?: string;
  note?: string;
  updatedBy?: string;
  at: string;
}

export interface Bonus {
  id: string;
  employeeId: string;
  period: string;
  amount: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface Decision {
  id: string;
  employeeId: string;
  date: string;
  kind: string;
  action: string;
  minutes?: number;
  cong?: number;
  note?: string;
  by: string;
  at: string;
}

export interface PayslipLine {
  label: string;
  amount: number;
  note?: string;
}

export interface PayslipDay {
  date: string;
  status: DayStatus;
  label: string;
  inAt?: string;
  outAt?: string;
  cong: number;
  lateMinutes: number;
  otMinutes: number;
}

export interface Payslip {
  employeeId: string;
  name: string;
  positionName: string;
  period: string;
  baseSalary: number;
  salaryType: SalaryType;
  cong: number;
  standardDays: number;
  workedMinutes: number;
  otMinutes: number;
  otPay: number;
  basePay: number;
  allowances: number;
  fixedBonus: number;
  adjustments: number;
  insurance: number;
  gross: number;
  net: number;
  lines: PayslipLine[];
  days: PayslipDay[];
  publishedAt: string;
}

export interface PayrollPeriod {
  period: string;
  status: 'open' | 'published';
  publishedAt?: string;
  publishedBy?: string;
  slips: Payslip[];
}

export interface Notification {
  id: string;
  employeeId: string;
  kind: 'payslip' | 'request' | 'system' | 'task';
  title: string;
  body: string;
  at: string;
  read: boolean;
  link?: string;
}

export interface Db {
  version: 1;
  seededAt: string;
  company: Company;
  settings: Settings;
  positions: Position[];
  shifts: Shift[];
  locations: Location[];
  holidays: Holiday[];
  employees: Employee[];
  schedules: Schedule[];
  punches: Punch[];
  requests: Request[];
  overrides: DayOverride[];
  bonuses: Bonus[];
  decisions: Decision[];
  payroll: PayrollPeriod[];
  notifications: Notification[];
}

export interface DayIssue {
  kind: 'ot' | 'missing' | 'absence' | 'outside' | 'wrong_shift' | 'late' | 'early' | 'no_punch';
  minutes?: number;
  note?: string;
}

export interface DayResult {
  date: string;
  weekday: number;
  isToday: boolean;
  scheduled: boolean;
  scheduleSource: 'base' | 'registered' | 'swap' | 'override';
  shiftId?: string;
  shiftName?: string;
  shiftCode?: string;
  shiftTime?: string;
  status: DayStatus;
  holidayName?: string;
  leaveKind?: string;
  inAt?: string;
  outAt?: string;
  inMinutes?: number;
  outMinutes?: number;
  workedMinutes: number;
  cong: number;
  lateMinutes: number;
  earlyMinutes: number;
  otMinutes: number;
  approvedOtMinutes: number;
  pendingOtMinutes: number;
  otMultiplier: number;
  outside: boolean;
  wrongShift: boolean;
  missingIn: boolean;
  missingOut: boolean;
  issues: DayIssue[];
  overrideNote?: string;
  requestNote?: string;
}

export interface EngineDayInput {
  date: string;
  weekday: number;
  isToday: boolean;
  isFuture: boolean;
  nowMinutes?: number;
  isHoliday?: Holiday;
  isWeekend: boolean;
  shift?: Shift;
  scheduleSource?: 'base' | 'registered' | 'swap' | 'override';
  offBySwap?: boolean;
  punches: Punch[];
  leave?: { kind: 'annual' | 'sick' | 'unpaid'; composite: boolean };
  forgot?: { inTime?: string; outTime?: string };
  override?: DayOverride;
  approvedOtMinutes: number;
  waiveLate: boolean;
  waiveEarly: boolean;
  settings: Settings;
  position: Position;
}

export interface MonthSummary {
  period: string;
  cong: number;
  lateDays: number;
  missingDays: number;
  absenceDays: number;
  leaveDays: number;
  holidayDays: number;
  workedMinutes: number;
  otApprovedMinutes: number;
  otPendingMinutes: number;
  basePay: number;
  otPay: number;
  allowances: number;
  fixedBonus: number;
  adjustments: number;
  insurance: number;
  gross: number;
  net: number;
  lines: PayslipLine[];
}

export type ApiError = { code: string; message: string; field?: string };
