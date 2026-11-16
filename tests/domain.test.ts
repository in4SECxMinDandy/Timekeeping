import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  computeDay,
  eachDate,
  fmtMoney,
  hmToMinutes,
  minutesSince,
  monthRange,
  otMultiplier,
  requestDuration,
  shiftBounds,
  validateRequestPayload,
} from '../shared/domain';
import type {
  DayResult,
  EngineDayInput,
  Position,
  Punch,
  Request,
  RequestPayload,
  Settings,
  Shift,
} from '../shared/types';

const DATE = '2026-10-20'; // thứ Ba

const hc: Shift = {
  id: 'hc',
  name: 'Hành chính',
  code: 'HC',
  start: '08:30',
  end: '17:30',
  breakStart: '12:00',
  breakEnd: '13:00',
  calc: 'frame',
  standardHours: 8,
  fullMinutes: 480,
  halfMinutes: 240,
  lateAllow: 0,
  otMin: 30,
  composite: false,
  noLate: false,
};

const night: Shift = {
  ...hc,
  id: 'night',
  name: 'Ca đêm',
  code: 'Đêm',
  start: '21:00',
  end: '05:00',
  breakStart: undefined,
  breakEnd: undefined,
  fullMinutes: 420,
  halfMinutes: 210,
};

const position: Position = {
  id: 'p1',
  name: 'Kinh doanh',
  salaryType: 'month',
  baseSalary: 9_000_000,
  tiers: [],
  flexible: false,
  shiftIds: ['hc'],
  leaveDays: 12,
  standardDays: 26,
  allowances: [],
  fixedBonus: 0,
  penaltiesEnabled: true,
  insuranceEnabled: true,
  otRates: { weekday: 1.5, satOff: 2, sun: 3, holiday: 3 },
  photoExempt: false,
  locationIds: ['l1'],
  anywhere: false,
};

const settings: Settings = {
  workdays: [1, 2, 3, 4, 5, 6],
  lateMode: 'full',
  allowEarlyOT: false,
  autoOtFromRequest: true,
  otMinMinutes: 30,
  requirePhoto: false,
  payCloseDay: 25,
  payrollEnabled: true,
  lateExplain: true,
};

function punch(kind: 'in' | 'out', hm: string, date = DATE, extra: Partial<Punch> = {}): Punch {
  return {
    id: `p-${kind}-${date}-${hm}`,
    employeeId: 'e3',
    workDate: date,
    shiftId: 'hc',
    at: `${date}T${hm}:00+07:00`,
    kind,
    outside: false,
    ...extra,
  };
}

function day(overrides: Partial<EngineDayInput> = {}): EngineDayInput {
  return {
    date: DATE,
    weekday: 2,
    isToday: false,
    isFuture: false,
    isWeekend: false,
    shift: hc,
    punches: [],
    approvedOtMinutes: 0,
    waiveLate: false,
    waiveEarly: false,
    settings,
    position,
    ...overrides,
  };
}

function run(overrides: Partial<EngineDayInput>): DayResult {
  return computeDay(day(overrides));
}

describe('computeDay · ca có lịch', () => {
  it('đủ công khi làm quá số phút quy định', () => {
    const r = run({ punches: [punch('in', '08:20'), punch('out', '17:35')] });
    assert.equal(r.status, 'ok');
    assert.equal(r.workedMinutes, 495); // 555 phút trừ 60 nghỉ trưa
    assert.equal(r.cong, 1);
    assert.equal(r.lateMinutes, 0);
    assert.deepEqual(r.issues, []);
  });

  it('đi muộn tính trọn thời gian ở chế độ full', () => {
    const r = run({ punches: [punch('in', '08:40'), punch('out', '17:30')] });
    assert.equal(r.status, 'late');
    assert.equal(r.lateMinutes, 10);
    assert.equal(r.cong, 0.5);
    assert.deepEqual(
      r.issues.map((i) => i.kind),
      ['late'],
    );
  });

  it('chế độ excess chỉ tính phần vượt và có dung sai', () => {
    const r = run({
      settings: { ...settings, lateMode: 'excess' },
      shift: { ...hc, lateAllow: 5 },
      punches: [punch('in', '08:40'), punch('out', '17:30')],
    });
    assert.equal(r.lateMinutes, 5);
  });

  it('miễn trừ đi muộn đưa trạng thái về đủ công', () => {
    const late = run({ punches: [punch('in', '08:40'), punch('out', '17:30')] });
    const waived = run({
      waiveLate: true,
      punches: [punch('in', '08:40'), punch('out', '17:30')],
    });
    assert.equal(late.status, 'late');
    assert.equal(waived.status, 'ok');
    assert.equal(waived.lateMinutes, 0);
  });

  it('về sớm ghi nhận số phút và vẫn tính công', () => {
    const r = run({ punches: [punch('in', '08:30'), punch('out', '16:30')] });
    assert.equal(r.earlyMinutes, 60);
    assert.equal(r.status, 'ok');
    assert.equal(r.cong, 0.5);
  });

  it('thiếu một lần chấm thì trạng thái là missing', () => {
    const r = run({ punches: [punch('in', '08:30')] });
    assert.equal(r.status, 'missing');
    assert.equal(r.missingOut, true);
    assert.equal(r.missingIn, false);
  });

  it('không chấm ngày trước đó là vắng mặt', () => {
    const r = run({});
    assert.equal(r.status, 'absent');
    assert.equal(r.cong, 0);
    assert.deepEqual(
      r.issues.map((i) => i.kind),
      ['absence'],
    );
  });

  it('giờ ra trước giờ vào coi như chưa chấm ra', () => {
    const r = run({ punches: [punch('in', '08:30'), punch('out', '08:00')] });
    assert.equal(r.status, 'missing');
    assert.equal(r.workedMinutes, 0);
  });
});

describe('computeDay · hôm nay', () => {
  it('chưa tới giờ vào thì chưa phải vắng mặt', () => {
    const r = run({ isToday: true, nowMinutes: hmToMinutes('08:00') });
    assert.equal(r.status, 'future');
    assert.deepEqual(r.issues, []);
  });

  it('đang trong ca khi đã qua giờ vào', () => {
    const r = run({ isToday: true, nowMinutes: hmToMinutes('09:00') });
    assert.equal(r.status, 'inprogress');
  });

  it('vẫn là vắng mặt khi ca đã kết thúc', () => {
    const r = run({ isToday: true, nowMinutes: hmToMinutes('18:00') });
    assert.equal(r.status, 'absent');
    assert.equal(r.cong, 0);
  });

  it('mới chấm vào thì ở trạng thái trong ca', () => {
    const r = run({ isToday: true, nowMinutes: hmToMinutes('12:00'), punches: [punch('in', '08:25')] });
    assert.equal(r.status, 'inprogress');
    assert.equal(r.missingIn, false);
  });
});

describe('computeDay · tăng ca', () => {
  it('OT sau giờ ra chỉ duyệt một phần thì phần còn lại chờ duyệt', () => {
    const r = run({
      punches: [punch('in', '08:20'), punch('out', '19:30')],
      approvedOtMinutes: 60,
    });
    assert.equal(r.otMinutes, 120);
    assert.equal(r.approvedOtMinutes, 60);
    assert.equal(r.pendingOtMinutes, 60);
    assert.equal(r.issues.some((i) => i.kind === 'ot'), false);
  });

  it('OT chưa duyệt và vượt ngưỡng tạo cảnh báo', () => {
    const r = run({ punches: [punch('in', '08:20'), punch('out', '19:30')] });
    assert.equal(r.pendingOtMinutes, 120);
    assert.deepEqual(
      r.issues.map((i) => i.kind),
      ['ot'],
    );
  });

  it('OT dưới ngưỡng không tính cảnh báo', () => {
    const r = run({ punches: [punch('in', '08:20'), punch('out', '17:50')] });
    assert.equal(r.otMinutes, 20);
    assert.deepEqual(r.issues, []);
  });

  it('bật allowEarlyOT thì đến sớm được tính tăng ca', () => {
    const r = run({
      settings: { ...settings, allowEarlyOT: true },
      punches: [punch('in', '07:00'), punch('out', '17:30')],
    });
    assert.equal(r.otMinutes, 90);
  });

  it('override noOt xoá toàn bộ tăng ca', () => {
    const r = run({
      punches: [punch('in', '08:20'), punch('out', '19:30')],
      approvedOtMinutes: 120,
      override: { id: 'o1', employeeId: 'e3', date: DATE, noOt: true, updatedBy: 'e1', at: `${DATE}T18:00:00+07:00` },
    });
    assert.equal(r.approvedOtMinutes, 0);
    assert.equal(r.pendingOtMinutes, 0);
  });
});

describe('computeDay · ca qua đêm và ca không có lịch', () => {
  it('chấm ra sau nửa đêm vẫn tính đúng thời lượng', () => {
    const r = run({
      shift: night,
      punches: [punch('in', '21:00'), punch('out', '05:05', '2026-10-21')],
    });
    assert.equal(r.workedMinutes, 485);
    assert.equal(r.cong, 1);
    assert.equal(r.otMinutes, 5);
  });

  it('ngày nghỉ không chấm là off, có chấm thì tính tăng ca toàn bộ', () => {
    assert.equal(run({ shift: undefined }).status, 'off');
    const r = run({
      shift: undefined,
      punches: [punch('in', '08:00'), punch('out', '17:00')],
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.otMinutes, 540); // không có ca nên không trừ nghỉ trưa
  });

  it('chấm sai ca so với lịch', () => {
    const r = run({
      punches: [
        punch('in', '08:30', DATE, { shiftId: 'other' }),
        punch('out', '17:30', DATE, { shiftId: 'other' }),
      ],
    });
    assert.equal(r.wrongShift, true);
    assert.equal(r.issues.some((i) => i.kind === 'wrong_shift'), true);
  });

  it('chấm ngoài phạm vi tạo cảnh báo, override chấp nhận thì hết', () => {
    const outside = run({
      punches: [
        punch('in', '08:30', DATE, { outside: true }),
        punch('out', '17:30', DATE, { outside: true }),
      ],
    });
    assert.equal(outside.outside, true);
    const accepted = run({
      punches: [
        punch('in', '08:30', DATE, { outside: true }),
        punch('out', '17:30', DATE, { outside: true }),
      ],
      override: {
        id: 'o2',
        employeeId: 'e3',
        date: DATE,
        acceptOutside: true,
        updatedBy: 'e1',
        at: `${DATE}T18:00:00+07:00`,
      },
    });
    assert.equal(accepted.outside, false);
  });
});

describe('computeDay · nghỉ phép và ngày lễ', () => {
  it('nghỉ phép năm tính một công, nghỉ không lương mất công', () => {
    assert.equal(run({ leave: { kind: 'annual', composite: false } }).cong, 1);
    assert.equal(run({ leave: { kind: 'unpaid', composite: false } }).cong, 0);
    assert.equal(run({ leave: { kind: 'sick', composite: true } }).cong, 0.5);
    assert.equal(run({ leave: { kind: 'annual', composite: false } }).status, 'leave');
  });

  it('đi làm ngày lễ tính toàn bộ thời gian là tăng ca', () => {
    const r = run({
      isHoliday: { id: 'h1', date: DATE, name: 'Quốc khánh' },
      punches: [punch('in', '08:00'), punch('out', '17:00')],
    });
    assert.equal(r.status, 'holiday');
    assert.equal(r.cong, 1);
    assert.equal(r.otMinutes, r.workedMinutes);
  });

  it('nghỉ ngày lễ vẫn hưởng công', () => {
    const r = run({ isHoliday: { id: 'h1', date: DATE, name: 'Quốc khánh' } });
    assert.equal(r.status, 'holiday');
    assert.equal(r.cong, 1);
    assert.equal(r.holidayName, 'Quốc khánh');
  });

  it('đổi ca đã duyệt thì thành ngày nghỉ', () => {
    const r = run({ offBySwap: true });
    assert.equal(r.status, 'off');
    assert.equal(r.cong, 0);
  });

  it('override công ghi đè kết quả', () => {
    const r = run({
      override: {
        id: 'o3',
        employeeId: 'e3',
        date: DATE,
        cong: 1,
        note: 'Đã xử lý thủ công',
        updatedBy: 'e1',
        at: `${DATE}T18:00:00+07:00`,
      },
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.cong, 1);
    assert.equal(r.overrideNote, 'Đã xử lý thủ công');
  });
});

describe('helper thời gian', () => {
  it('minutesSince quy đổi chấm sau nửa đêm thành phút lớn hơn 1440', () => {
    assert.equal(minutesSince(DATE, '2026-10-21T00:30:00+07:00'), 1470);
    assert.equal(minutesSince(DATE, `${DATE}T08:30:00+07:00`), 510);
  });

  it('shiftBounds nhận diện ca qua đêm', () => {
    const b = shiftBounds(night);
    assert.equal(b.overnight, true);
    assert.equal(b.end, 1740);
  });

  it('eachDate và addDays bao gồm cả hai mốc', () => {
    assert.equal(eachDate('2026-10-30', '2026-11-02').length, 4);
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });

  it('monthRange trả đủ ngày của tháng 2 nhuận', () => {
    assert.equal(monthRange('2028-02').days.length, 29);
    assert.equal(monthRange('2026-10').from, '2026-10-01');
  });

  it('hệ số tăng ca theo ngày lễ và chủ nhật', () => {
    assert.equal(otMultiplier(position, 2, false), 1.5);
    assert.equal(otMultiplier(position, 7, false), 3);
    assert.equal(otMultiplier(position, 2, true), 3);
  });

  it('fmtMoney dùng dấu phân cách Việt Nam', () => {
    assert.equal(fmtMoney(9_370_030), '9.370.030đ');
  });
});

describe('đơn từ', () => {
  function request(type: Request['type'], payload: RequestPayload): Request {
    return { id: 'rq1', employeeId: 'e3', type, status: 'pending', payload, createdAt: `${DATE}T09:00:00+07:00` };
  }

  it('bắt buộc lý do và chặn khoảng ngày ngược', () => {
    assert.match(
      validateRequestPayload({ kind: 'leave', leaveType: 'annual', from: '2026-11-01', to: '2026-10-31', reason: 'Nghỉ việc gia đình' }) ?? '',
      /ngày/i,
    );
    assert.match(validateRequestPayload({ kind: 'explain', date: DATE, reason: '' }) ?? '', /lý do/i);
    assert.equal(
      validateRequestPayload({ kind: 'explain', date: DATE, reason: 'Xe hỏng giữa đường' }),
      null,
    );
  });

  it('giới hạn số phút đi muộn và thời lượng tăng ca', () => {
    assert.ok(validateRequestPayload({ kind: 'late_early', mode: 'late', date: DATE, minutes: 900, reason: 'Kẹt xe quá lâu' }));
    assert.equal(
      validateRequestPayload({ kind: 'late_early', mode: 'late', date: DATE, minutes: 30, reason: 'Kẹt xe' }),
      null,
    );
  });

  it('requestDuration chỉ tính phút với tăng ca và đi muộn', () => {
    const ot = request('ot', { kind: 'ot', date: DATE, shiftId: 'night', from: '18:00', to: '21:00', reason: 'Chốt số liệu' });
    assert.equal(requestDuration(ot), 180);
    const overnight = request('ot', { kind: 'ot', date: DATE, shiftId: 'night', from: '22:00', to: '01:00', reason: 'Trực hệ thống' });
    assert.equal(requestDuration(overnight), 180);
    const late = request('late_early', { kind: 'late_early', mode: 'late', date: DATE, minutes: 25, reason: 'Kẹt xe' });
    assert.equal(requestDuration(late), 25);
    const leave = request('leave', { kind: 'leave', leaveType: 'annual', from: '2026-11-02', to: '2026-11-04', reason: 'Việc gia đình' });
    assert.equal(requestDuration(leave), 0);
    assert.equal(eachDate('2026-11-02', '2026-11-04').length, 3);
  });
});
