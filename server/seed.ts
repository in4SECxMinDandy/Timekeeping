import crypto from 'node:crypto';
import type {
  Db,
  Employee,
  Holiday,
  Location,
  Position,
  Punch,
  Request,
  Schedule,
  Shift,
} from '../shared/types';
import {
  addDays,
  atFromMinutes,
  dowOf,
  fmtDateVN,
  ictParts,
  monthRange,
  nowIctIso,
  periodOf,
  todayIct,
} from '../shared/domain';

function pin(pinValue: string): { pinHash: string; pinSalt: string } {
  const pinSalt = crypto.randomBytes(16).toString('hex');
  return { pinHash: crypto.scryptSync(pinValue, pinSalt, 64).toString('hex'), pinSalt };
}

function nextMonthStart(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function createSeedDb(): Promise<Db> {
  const today = todayIct();
  const now = ictParts();
  const currentPeriod = periodOf(today);
  const prevPeriod = periodOf(addDays(`${currentPeriod}-01`, -1));
  const prevRange = monthRange(prevPeriod);
  const currentRange = monthRange(currentPeriod);
  const scheduleEnd = addDays(today, 21);
  const nextPeriod = periodOf(nextMonthStart(currentPeriod));

  const company: Db['company'] = {
    name: 'An Phát',
    code: 'ANPHAT',
    address: '18 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội',
    appName: 'Chấm công An Phát',
    brandColor: '#1A73E8',
  };

  const settings: Db['settings'] = {
    workdays: [1, 2, 3, 4, 5, 6],
    lateMode: 'excess',
    allowEarlyOT: false,
    autoOtFromRequest: true,
    otMinMinutes: 30,
    requirePhoto: false,
    payCloseDay: 5,
    payrollEnabled: true,
    lateExplain: true,
  };

  const holidays: Holiday[] = [
    { id: 'h1', date: '2026-01-01', name: 'Tết Dương lịch' },
    { id: 'h2', date: '2026-02-16', name: 'Tết Nguyên đán' },
    { id: 'h3', date: '2026-02-17', name: 'Tết Nguyên đán' },
    { id: 'h4', date: '2026-02-18', name: 'Tết Nguyên đán' },
    { id: 'h5', date: '2026-02-19', name: 'Tết Nguyên đán' },
    { id: 'h6', date: '2026-02-20', name: 'Tết Nguyên đán' },
    { id: 'h7', date: '2026-04-30', name: 'Ngày Giải phóng miền Nam' },
    { id: 'h8', date: '2026-05-01', name: 'Quốc tế Lao động' },
    { id: 'h9', date: '2026-09-02', name: 'Quốc khánh' },
    { id: 'h10', date: '2026-09-03', name: 'Nghỉ bù Quốc khánh' },
  ];

  const shifts: Shift[] = [
    {
      id: 'sh_hc',
      name: 'Hành chính',
      code: 'HC',
      start: '08:30',
      end: '17:30',
      breakStart: '12:00',
      breakEnd: '13:00',
      calc: 'frame',
      standardHours: 8,
      fullMinutes: 420,
      halfMinutes: 240,
      lateAllow: 5,
      otMin: 30,
      composite: false,
      noLate: false,
      note: 'Ca văn phòng tiêu chuẩn, nghỉ trưa 1 giờ.',
    },
    {
      id: 'sh_lh',
      name: 'Linh hoạt',
      code: 'LH',
      start: '08:00',
      end: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      calc: 'actual',
      standardHours: 8,
      fullMinutes: 480,
      halfMinutes: 270,
      lateAllow: 5,
      otMin: 30,
      composite: false,
      noLate: false,
      note: 'Dành cho quản lý, tính theo giờ thực tế.',
    },
    {
      id: 'sh_tv2',
      name: 'Tạp vụ 2 giờ',
      code: 'TV2',
      start: '06:00',
      end: '08:00',
      calc: 'frame',
      standardHours: 2,
      fullMinutes: 90,
      halfMinutes: 45,
      lateAllow: 0,
      otMin: 30,
      composite: false,
      noLate: true,
      note: 'Ca ngắn buổi sáng, không tính muộn/sớm.',
    },
    {
      id: 'sh_sang',
      name: 'Ca sáng',
      code: 'SANG',
      start: '07:00',
      end: '12:00',
      calc: 'frame',
      standardHours: 5,
      fullMinutes: 270,
      halfMinutes: 150,
      lateAllow: 5,
      otMin: 30,
      composite: true,
      noLate: false,
      note: 'Ca bán thời gian buổi sáng, một công tính ½ ngày.',
    },
    {
      id: 'sh_chieu',
      name: 'Ca chiều',
      code: 'CHIEU',
      start: '12:00',
      end: '17:00',
      calc: 'frame',
      standardHours: 5,
      fullMinutes: 270,
      halfMinutes: 150,
      lateAllow: 5,
      otMin: 30,
      composite: true,
      noLate: false,
      note: 'Ca bán thời gian buổi chiều, một công tính ½ ngày.',
    },
  ];

  const locations: Location[] = [
    {
      id: 'loc_hq',
      name: 'Văn phòng An Phát',
      address: '18 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội',
      lat: 21.0285,
      lng: 105.8542,
      radius: 150,
      positionIds: ['p_office', 'p_acct', 'p_sales', 'p_mgr', 'p_clean'],
    },
    {
      id: 'loc_branch',
      name: 'Chi nhánh Cầu Giấy',
      address: '25 Trần Duy Hưng, Cầu Giấy, Hà Nội',
      lat: 21.0362,
      lng: 105.7906,
      radius: 100,
      positionIds: ['p_office', 'p_acct', 'p_sales', 'p_mgr', 'p_intern'],
    },
  ];

  const positions: Position[] = [
    {
      id: 'p_office',
      name: 'Nhân viên văn phòng',
      salaryType: 'month',
      baseSalary: 11_500_000,
      tiers: [
        { id: 'off_j', name: 'Nhân viên', amount: 11_500_000, headcount: 2 },
        { id: 'off_s', name: 'Chuyên viên', amount: 14_000_000, headcount: 1 },
        { id: 'off_l', name: 'Trưởng nhóm', amount: 16_000_000, headcount: 0 },
      ],
      flexible: false,
      shiftIds: ['sh_hc'],
      workdays: [1, 2, 3, 4, 5, 6],
      leaveDays: 12,
      standardDays: 26,
      allowances: [
        { id: 'al_off_1', name: 'Xăng xe', amount: 15_000, kind: 'day', enabled: true },
        { id: 'al_off_2', name: 'Điện thoại', amount: 200_000, kind: 'month', enabled: true },
        { id: 'al_off_3', name: 'Chuyên cần', amount: 300_000, kind: 'month', enabled: false },
      ],
      fixedBonus: 0,
      penaltiesEnabled: true,
      insuranceEnabled: true,
      otRates: { weekday: 1.5, satOff: 2, sun: 2, holiday: 3 },
      photoExempt: false,
      locationIds: ['loc_hq', 'loc_branch'],
      anywhere: false,
      headcountWanted: 3,
    },
    {
      id: 'p_acct',
      name: 'Kế toán',
      salaryType: 'month',
      baseSalary: 13_500_000,
      tiers: [
        { id: 'acc_j', name: 'Kế toán viên', amount: 13_500_000, headcount: 1 },
        { id: 'acc_s', name: 'Kế toán tổng hợp', amount: 16_000_000, headcount: 0 },
        { id: 'acc_l', name: 'Kế toán trưởng', amount: 18_000_000, headcount: 0 },
      ],
      flexible: false,
      shiftIds: ['sh_hc'],
      workdays: [1, 2, 3, 4, 5, 6],
      leaveDays: 12,
      standardDays: 26,
      allowances: [
        { id: 'al_acc_1', name: 'Trách nhiệm', amount: 500_000, kind: 'month', enabled: true },
        { id: 'al_acc_2', name: 'Điện thoại', amount: 200_000, kind: 'month', enabled: true },
      ],
      fixedBonus: 0,
      penaltiesEnabled: true,
      insuranceEnabled: true,
      otRates: { weekday: 1.5, satOff: 2, sun: 2, holiday: 3 },
      photoExempt: false,
      locationIds: ['loc_hq'],
      anywhere: false,
      headcountWanted: 1,
    },
    {
      id: 'p_sales',
      name: 'Kinh doanh',
      salaryType: 'month',
      baseSalary: 9_000_000,
      tiers: [
        { id: 'sal_j', name: 'Nhân viên', amount: 9_000_000, headcount: 3 },
        { id: 'sal_s', name: 'Chuyên viên', amount: 11_000_000, headcount: 1 },
        { id: 'sal_l', name: 'Trưởng nhóm', amount: 14_000_000, headcount: 0 },
      ],
      flexible: false,
      shiftIds: ['sh_hc'],
      workdays: [1, 2, 3, 4, 5, 6],
      leaveDays: 12,
      standardDays: 26,
      allowances: [
        { id: 'al_sal_1', name: 'Điện thoại', amount: 300_000, kind: 'month', enabled: true },
        { id: 'al_sal_2', name: 'Xăng xe', amount: 20_000, kind: 'day', enabled: true },
      ],
      fixedBonus: 500_000,
      penaltiesEnabled: true,
      insuranceEnabled: true,
      otRates: { weekday: 1.5, satOff: 2, sun: 2, holiday: 3 },
      photoExempt: false,
      locationIds: ['loc_hq', 'loc_branch'],
      anywhere: false,
      headcountWanted: 3,
    },
    {
      id: 'p_mgr',
      name: 'Quản lý',
      salaryType: 'month',
      baseSalary: 20_000_000,
      tiers: [
        { id: 'mgr_j', name: 'Quản lý', amount: 20_000_000, headcount: 1 },
        { id: 'mgr_s', name: 'Quản lý cấp cao', amount: 24_000_000, headcount: 0 },
        { id: 'mgr_l', name: 'Giám đốc', amount: 28_000_000, headcount: 0 },
      ],
      flexible: false,
      shiftIds: ['sh_lh'],
      workdays: [1, 2, 3, 4, 5, 6],
      leaveDays: 14,
      standardDays: 26,
      allowances: [
        { id: 'al_mgr_1', name: 'Điện thoại', amount: 500_000, kind: 'month', enabled: true },
        { id: 'al_mgr_2', name: 'Xăng xe', amount: 20_000, kind: 'day', enabled: true },
      ],
      fixedBonus: 0,
      penaltiesEnabled: true,
      insuranceEnabled: true,
      otRates: { weekday: 1.5, satOff: 2, sun: 2, holiday: 3 },
      photoExempt: true,
      locationIds: ['loc_hq', 'loc_branch'],
      anywhere: true,
      headcountWanted: 1,
    },
    {
      id: 'p_clean',
      name: 'Tạp vụ',
      salaryType: 'shift',
      baseSalary: 60_000,
      tiers: [{ id: 'cln_j', name: 'Tạp vụ', amount: 60_000, headcount: 1 }],
      flexible: false,
      shiftIds: ['sh_tv2'],
      workdays: [1, 2, 3, 4, 5, 6],
      leaveDays: 6,
      standardDays: 26,
      allowances: [],
      fixedBonus: 0,
      penaltiesEnabled: false,
      insuranceEnabled: false,
      otRates: { weekday: 1.5, satOff: 2, sun: 2, holiday: 3 },
      photoExempt: false,
      locationIds: ['loc_hq'],
      anywhere: false,
      headcountWanted: 1,
    },
    {
      id: 'p_intern',
      name: 'Thực tập',
      salaryType: 'hour',
      baseSalary: 20_000,
      tiers: [{ id: 'int_j', name: 'Thực tập sinh', amount: 20_000, headcount: 1 }],
      flexible: true,
      shiftIds: ['sh_sang', 'sh_chieu'],
      workdays: [1, 2, 3, 4, 5, 6],
      leaveDays: 6,
      standardDays: 26,
      allowances: [],
      fixedBonus: 0,
      penaltiesEnabled: false,
      insuranceEnabled: false,
      otRates: { weekday: 1.5, satOff: 2, sun: 2, holiday: 3 },
      photoExempt: true,
      locationIds: ['loc_branch'],
      anywhere: false,
      headcountWanted: 1,
    },
  ];

  const mkEmployee = (
    id: string,
    code: string,
    name: string,
    email: string,
    role: Employee['role'],
    positionId: string,
    pinCode: string,
    extra: Partial<Employee> = {},
  ): Employee => ({
    id,
    code,
    name,
    email,
    role,
    positionId,
    status: 'active',
    startDate: '2025-03-01',
    contract: 'Toàn thời gian',
    photoPolicy: 'company',
    createdAt: `${prevRange.from}T09:00:00+07:00`,
    ...pin(pinCode),
    ...extra,
  });

  const employees: Employee[] = [
    mkEmployee('e1', 'AP001', 'Lê Phương Thảo', 'thao@anphat.vn', 'admin', 'p_mgr', '1234', {
      tierId: 'mgr_j',
      startDate: '2023-01-15',
      contract: 'Toàn thời gian',
    }),
    mkEmployee('e2', 'AP002', 'Trần Thị Mai', 'mai@anphat.vn', 'hr', 'p_acct', '2345', {
      tierId: 'acc_j',
      managerId: 'e1',
      startDate: '2023-06-01',
    }),
    mkEmployee('e3', 'AP003', 'Nguyễn Minh Đức', 'duc@anphat.vn', 'employee', 'p_sales', '1111', {
      tierId: 'sal_j',
      managerId: 'e4',
      startDate: '2024-02-19',
    }),
    mkEmployee('e4', 'AP004', 'Phạm Quang Hưng', 'hung@anphat.vn', 'manager', 'p_sales', '2222', {
      tierId: 'sal_s',
      managerId: 'e1',
      shiftOverrideId: 'sh_lh',
      salaryOverride: 13_000_000,
      startDate: '2023-09-01',
    }),
    mkEmployee('e5', 'AP005', 'Vũ Ngọc Lan', 'lan@anphat.vn', 'employee', 'p_office', '9999', {
      tierId: 'off_j',
      managerId: 'e1',
      startDate: '2024-04-08',
    }),
    mkEmployee('e6', 'AP006', 'Đỗ Anh Tuấn', 'tuan@anphat.vn', 'employee', 'p_sales', '9999', {
      tierId: 'sal_j',
      managerId: 'e4',
      startDate: '2024-08-12',
    }),
    mkEmployee('e7', 'AP007', 'Bùi Thu Hoà', 'hoa@anphat.vn', 'employee', 'p_office', '9999', {
      tierId: 'off_s',
      managerId: 'e1',
      startDate: '2023-11-20',
    }),
    mkEmployee('e8', 'AP008', 'Ngô Khánh Vy', 'vy@anphat.vn', 'employee', 'p_intern', '9999', {
      tierId: 'int_j',
      managerId: 'e4',
      contract: 'Thực tập',
      startDate: '2026-06-01',
    }),
    mkEmployee('e9', 'AP009', 'Hoàng Văn Sơn', 'son@anphat.vn', 'employee', 'p_clean', '9999', {
      tierId: 'cln_j',
      managerId: 'e1',
      contract: 'Bán thời gian',
      startDate: '2024-10-01',
    }),
  ];

  const holidayDates = new Set(holidays.map((h) => h.date));
  const schedules: Schedule[] = [];
  let scheduleSeq = 1;
  const baseShifts = new Map(employees.map((e) => [e.id, e.shiftOverrideId]));

  for (let cursor = prevRange.from; cursor <= scheduleEnd; cursor = addDays(cursor, 1)) {
    if (holidayDates.has(cursor)) continue;
    const dow = dowOf(cursor);
    for (const employee of employees) {
      const position = positions.find((p) => p.id === employee.positionId)!;
      const workdays = position.workdays ?? settings.workdays;
      if (!workdays.includes(dow)) continue;
      if (cursor < employee.startDate) continue;
      let shiftId = baseShifts.get(employee.id) ?? position.shiftIds[0];
      if (position.id === 'p_intern') {
        shiftId = [1, 3, 5].includes(dow) ? 'sh_sang' : 'sh_chieu';
      }
      schedules.push({
        id: `sch${scheduleSeq++}`,
        employeeId: employee.id,
        date: cursor,
        shiftId,
        status: 'scheduled',
      });
    }
  }

  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const punches: Punch[] = [];
  const requests: Request[] = [];
  let punchSeq = 1;
  let reqSeq = 1;

  const addPunch = (
    employee: Employee,
    date: string,
    shiftId: string,
    kind: 'in' | 'out',
    minutes: number,
    opts: { outside?: boolean; lat?: number; lng?: number; note?: string } = {},
  ) => {
    const position = positions.find((p) => p.id === employee.positionId)!;
    const location = locById.get(position.locationIds[0])!;
    const outside = opts.outside ?? false;
    const lat = opts.lat ?? location.lat;
    const lng = opts.lng ?? location.lng;
    punches.push({
      id: `pu${punchSeq++}`,
      employeeId: employee.id,
      workDate: date,
      shiftId,
      at: atFromMinutes(date, minutes),
      kind,
      lat,
      lng,
      accuracy: 8,
      locationId: outside ? undefined : location.id,
      outside,
      distance: outside ? 2600 : 12,
      note: opts.note,
    });
  };

  const yesterday = addDays(today, -1);
  const d2 = addDays(today, -2);
  const d3 = addDays(today, -3);
  const d5 = addDays(today, -5);
  const d7 = addDays(today, -7);
  const prevOtDate = `${prevPeriod}-21`;

  // Yêu cầu mẫu
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e4',
    type: 'ot',
    status: 'pending',
    payload: {
      kind: 'ot',
      date: yesterday,
      shiftId: 'sh_lh',
      from: '17:45',
      to: '19:15',
      reason: 'Giao hàng cho khách cuối ngày và đối chiếu biên bản.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 14 * 3600_000)),
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e3',
    type: 'ot',
    status: 'pending',
    payload: {
      kind: 'ot',
      date: d2,
      shiftId: 'sh_hc',
      from: '17:40',
      to: '19:10',
      reason: 'Chốt hợp đồng với khách hàng, hoàn tất hồ sơ thanh toán.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 30 * 3600_000)),
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e6',
    type: 'ot',
    status: 'pending',
    payload: {
      kind: 'ot',
      date: yesterday,
      shiftId: 'sh_hc',
      from: '17:45',
      to: '19:00',
      reason: 'Kiểm kho cuối ngày cùng bộ phận vận hành.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 13 * 3600_000)),
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e8',
    type: 'leave',
    status: 'pending',
    payload: {
      kind: 'leave',
      leaveType: 'annual',
      from: today,
      to: today,
      reason: 'Có việc gia đình, xin nghỉ một ngày.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 20 * 3600_000)),
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e3',
    type: 'late_early',
    status: 'pending',
    payload: {
      kind: 'late_early',
      mode: 'late',
      date: d5,
      minutes: 25,
      shiftId: 'sh_hc',
      reason: 'Kẹt xe trên đường đến công ty do mưa lớn.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 5 * 24 * 3600_000)),
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e9',
    type: 'explain',
    status: 'pending',
    payload: {
      kind: 'explain',
      date: yesterday,
      shiftId: 'sh_tv2',
      reason: 'Đi mua vật tư cho văn phòng nên chấm công ngoài vùng.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 15 * 3600_000)),
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e8',
    type: 'leave',
    status: 'approved',
    payload: {
      kind: 'leave',
      leaveType: 'annual',
      from: d7,
      to: d7,
      reason: 'Nghỉ phép năm.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 9 * 24 * 3600_000)),
    decidedAt: nowIctIso(new Date(Date.now() - 8 * 24 * 3600_000)),
    decidedBy: 'e1',
    decisionNote: 'Đã duyệt, nhớ bàn giao công việc.',
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e8',
    type: 'leave',
    status: 'approved',
    payload: {
      kind: 'leave',
      leaveType: 'annual',
      from: `${prevPeriod}-12`,
      to: `${prevPeriod}-12`,
      reason: 'Nghỉ phép năm.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 40 * 24 * 3600_000)),
    decidedAt: nowIctIso(new Date(Date.now() - 39 * 24 * 3600_000)),
    decidedBy: 'e1',
  });
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e3',
    type: 'ot',
    status: 'approved',
    payload: {
      kind: 'ot',
      date: prevOtDate,
      shiftId: 'sh_hc',
      from: '17:45',
      to: '19:00',
      reason: 'Hỗ trợ đối tác hoàn thiện hồ sơ.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 35 * 24 * 3600_000)),
    decidedAt: nowIctIso(new Date(Date.now() - 34 * 24 * 3600_000)),
    decidedBy: 'e1',
  });
  const registerDate1 = addDays(today, 3);
  const registerDate2 = addDays(today, 4);
  requests.push({
    id: `rq${reqSeq++}`,
    employeeId: 'e8',
    type: 'register',
    status: 'approved',
    payload: {
      kind: 'register',
      dates: [
        { date: registerDate1, shiftId: 'sh_sang' },
        { date: registerDate2, shiftId: 'sh_chieu' },
      ],
      reason: 'Đăng ký đi làm thêm ca linh hoạt trong tuần sau.',
    },
    createdAt: nowIctIso(new Date(Date.now() - 6 * 3600_000)),
    decidedAt: nowIctIso(new Date(Date.now() - 5 * 3600_000)),
    decidedBy: 'e1',
  });

  // Dữ liệu chấm công.
  const special = (employee: Employee, date: string): boolean => {
    if (date === prevOtDate && employee.id === 'e3') {
      addPunch(employee, date, 'sh_hc', 'in', 8 * 60 + 28);
      addPunch(employee, date, 'sh_hc', 'out', 19 * 60);
      return true;
    }
    if (date === yesterday) {
      if (employee.id === 'e3') {
        addPunch(employee, date, 'sh_hc', 'in', 8 * 60 + 33, {
          note: 'Quên bấm ra ca.',
        });
        return true;
      }
      if (employee.id === 'e4') {
        addPunch(employee, date, 'sh_lh', 'in', 7 * 60 + 58);
        addPunch(employee, date, 'sh_lh', 'out', 19 * 60 + 15);
        return true;
      }
      if (employee.id === 'e6') {
        addPunch(employee, date, 'sh_hc', 'in', 8 * 60 + 32);
        addPunch(employee, date, 'sh_hc', 'out', 19 * 60 + 5);
        return true;
      }
      if (employee.id === 'e2') {
        addPunch(employee, date, 'sh_lh', 'in', 8 * 60 + 2);
        addPunch(employee, date, 'sh_lh', 'out', 17 * 60 + 58);
        return true;
      }
      if (employee.id === 'e9') {
        addPunch(employee, date, 'sh_tv2', 'in', 6 * 60 + 2, {
          outside: true,
          lat: 21.06,
          lng: 105.8,
          note: 'Đi mua vật tư.',
        });
        addPunch(employee, date, 'sh_tv2', 'out', 8 * 60 + 1);
        return true;
      }
    }
    if (date === d2 && employee.id === 'e6') return true;
    if (date === d2 && employee.id === 'e3') {
      addPunch(employee, date, 'sh_hc', 'in', 8 * 60 + 28);
      addPunch(employee, date, 'sh_hc', 'out', 19 * 60 + 10);
      return true;
    }
    if (date === d3 && employee.id === 'e3') {
      addPunch(employee, date, 'sh_hc', 'in', 9 * 60 + 5);
      addPunch(employee, date, 'sh_hc', 'out', 17 * 60 + 40);
      return true;
    }
    if (date === d5 && employee.id === 'e3') {
      addPunch(employee, date, 'sh_hc', 'in', 8 * 60 + 58);
      addPunch(employee, date, 'sh_hc', 'out', 17 * 60 + 33);
      return true;
    }
    if (date === d7 && employee.id === 'e8') return true;
    return false;
  };

  let genIdx = 0;
  for (const schedule of schedules) {
    if (schedule.date >= today) continue;
    const employee = employees.find((e) => e.id === schedule.employeeId)!;
    if (special(employee, schedule.date)) {
      genIdx++;
      continue;
    }
    const shift = shiftById.get(schedule.shiftId)!;
    const [sh, sm] = shift.start.split(':').map(Number);
    const [eh, em] = shift.end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const employeeIdx = employees.findIndex((e) => e.id === employee.id);
    const inDelta = ((genIdx * 37 + employeeIdx * 11) % 10) - 3;
    const outDelta = ((genIdx * 53 + employeeIdx * 7) % 9) - 4;
    addPunch(employee, schedule.date, shift.id, 'in', startMin + inDelta);
    addPunch(employee, schedule.date, shift.id, 'out', Math.max(startMin + 60, endMin + outDelta));
    genIdx++;
  }

  // Hôm nay: phản ánh đúng thời điểm hiện tại để bảng điều phối sống.
  const todayLeaveIds = new Set(
    requests
      .filter((r) => r.status === 'approved' && r.type === 'leave')
      .filter((r) => {
        const p = r.payload;
        return p.kind === 'leave' && p.from <= today && p.to >= today;
      })
      .map((r) => r.employeeId),
  );
  const todaySchedules = schedules.filter((s) => s.date === today);
  todaySchedules.forEach((s, idx) => {
    if (todayLeaveIds.has(s.employeeId)) return;
    const shift = shiftById.get(s.shiftId)!;
    const [sh, sm] = shift.start.split(':').map(Number);
    const [eh, em] = shift.end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const employee = employees.find((e) => e.id === s.employeeId)!;
    if (employee.id === 'e5' || employee.id === 'e7') return;
    if (now.minutes < startMin + 3) return;
    const lateBy = employee.id === 'e3' ? 17 : employee.id === 'e6' ? 6 : 2;
    addPunch(employee, today, shift.id, 'in', startMin + lateBy);
    const keepOpen = employee.id === 'e3' || employee.id === 'e4';
    if (!keepOpen && now.minutes > endMin + 5) {
      addPunch(employee, today, shift.id, 'out', endMin + 2);
    }
  });

  // Cập nhật công thức: dùng engine để tạo bảng lương tháng trước đã công bố.
  const db: Db = {
    version: 1,
    seededAt: nowIctIso(),
    company,
    settings,
    positions,
    shifts,
    locations,
    holidays,
    employees,
    schedules,
    punches,
    requests,
    overrides: [],
    bonuses: [],
    decisions: [],
    payroll: [],
    notifications: [],
  };

  // Lương tháng trước được tính bởi server/compute (import động để tránh vòng lặp).
  const { buildSlip } = await import('./compute');
  const publishedAt = nowIctIso(new Date(Date.now() - 6 * 24 * 3600_000));
  const slips = employees.map((employee) =>
    buildSlip(db, employee, prevPeriod, today, publishedAt),
  );
  db.payroll.push({
    period: prevPeriod,
    status: 'published',
    publishedAt,
    publishedBy: 'e1',
    slips,
  });

  // Thưởng/phạt mẫu cho tháng hiện tại.
  db.bonuses.push({
    id: 'bn1',
    employeeId: 'e6',
    period: currentPeriod,
    amount: 1_000_000,
    reason: 'Thưởng doanh số tháng 10',
    createdAt: nowIctIso(new Date(Date.now() - 2 * 24 * 3600_000)),
    createdBy: 'e1',
  });
  db.bonuses.push({
    id: 'bn2',
    employeeId: 'e9',
    period: currentPeriod,
    amount: -100_000,
    reason: 'Đi muộn không giải trình',
    createdAt: nowIctIso(new Date(Date.now() - 3 * 24 * 3600_000)),
    createdBy: 'e1',
  });

  db.notifications.push(
    {
      id: 'nt1',
      employeeId: 'e3',
      kind: 'payslip',
      title: `Phiếu lương ${fmtDateVN(prevRange.from)} – ${fmtDateVN(prevRange.to)} đã công bố`,
      body: 'Xem chi tiết thu nhập và bảng công trong mục Lương.',
      at: publishedAt,
      read: false,
      link: '/m/luong',
    },
    {
      id: 'nt2',
      employeeId: 'e3',
      kind: 'system',
      title: 'Chào mừng bạn đến với Chấm công An Phát',
      body: 'Bật định vị và cấp quyền thông báo để chấm công nhanh hơn.',
      at: nowIctIso(new Date(Date.now() - 10 * 24 * 3600_000)),
      read: true,
    },
    {
      id: 'nt3',
      employeeId: 'e3',
      kind: 'request',
      title: 'Đơn làm thêm giờ đang chờ duyệt',
      body: 'Quản lý sẽ phản hồi trong hôm nay.',
      at: nowIctIso(new Date(Date.now() - 30 * 3600_000)),
      read: true,
      link: '/m/don',
    },
    ...employees
      .filter((e) => e.id !== 'e3')
      .map((e) => ({
        id: `nt_${e.id}`,
        employeeId: e.id,
        kind: 'payslip' as const,
        title: `Phiếu lương ${prevPeriod.slice(5)}/${prevPeriod.slice(0, 4)} đã công bố`,
        body: 'Xem chi tiết thu nhập trong mục Lương.',
        at: publishedAt,
        read: true,
        link: '/m/luong',
      })),
  );

  return db;
}
