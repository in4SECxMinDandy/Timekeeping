import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, ErrorState, LoadingBlock } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import {
  WEEKDAYS_SHORT,
  addDays,
  dateLong,
  dowOf,
  fmtDateVN,
  shiftTimeLabel,
  todayIct,
} from '../../lib/format';
import type { ScheduleData } from '../../lib/types';

export default function MobileSchedulePage() {
  const today = todayIct();
  const [weekStart, setWeekStart] = useState(() => addDays(today, 1 - dowOf(today)));
  const [selected, setSelected] = useState(today);
  const weekEnd = addDays(weekStart, 6);
  const { data, error, loading, reload } = useAsync<ScheduleData>(
    () => api.get(`/api/me/schedule?from=${weekStart}&to=${weekEnd}`),
    [weekStart],
  );

  const moveWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setSelected(next);
  };

  if (loading) {
    return (
      <div className="m-page">
        <LoadingBlock rows={5} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="m-page">
        <ErrorState message={error ?? 'Không tải được lịch làm việc.'} onRetry={() => reload()} />
      </div>
    );
  }

  const shiftById = new Map(data.shifts.map((s) => [s.id, s]));
  const holidayByDate = new Map(data.holidays.map((h) => [h.date, h.name]));
  const shiftsFor = (date: string) => {
    const registered = data.registrations.filter((r) => r.date === date);
    const scheduled = data.schedules.filter((s) => s.date === date);
    const ids = [
      ...new Set([...scheduled.map((s) => s.shiftId), ...registered.map((r) => r.shiftId)]),
    ];
    return ids
      .map((id) => shiftById.get(id))
      .filter((shift): shift is NonNullable<typeof shift> => Boolean(shift))
      .map((shift) => ({
        shift,
        registered: registered.some((r) => r.shiftId === shift.id),
      }));
  };
  const weekShifts = data.dates.flatMap((date) => shiftsFor(date));
  const selectedShifts = shiftsFor(selected);
  const holidayName = holidayByDate.get(selected);

  return (
    <div className="m-page m-page-tight">
      <section className="m-cal-card">
        <div className="m-month-nav">
          <button type="button" aria-label="Tuần trước" onClick={() => moveWeek(-1)}>
            <ChevronLeft size={17} />
          </button>
          <div className="m-month-label">
            {fmtDateVN(weekStart, { short: true })} – {fmtDateVN(weekEnd, { short: true })}
          </div>
          <button type="button" aria-label="Tuần sau" onClick={() => moveWeek(1)}>
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="m-week-strip" style={{ marginTop: 8 }}>
          {data.dates.map((date) => {
            const hasShift = shiftsFor(date).length > 0;
            return (
              <button
                type="button"
                key={date}
                className={`m-week-day ${hasShift ? 'has-shift' : ''} ${
                  date === data.today ? 'today' : ''
                } ${date === selected ? 'active' : ''}`}
                onClick={() => setSelected(date)}
                aria-pressed={date === selected}
                aria-label={dateLong(date)}
              >
                <span>{WEEKDAYS_SHORT[dowOf(date)]}</span>
                <b>{Number(date.slice(8))}</b>
                <i />
              </button>
            );
          })}
        </div>
      </section>

      <div className="m-between" style={{ padding: '0 2px' }}>
        <span className="m-caption">
          Tuần này bạn có <b className="m-strong" style={{ color: 'var(--ink)' }}>{weekShifts.length} ca</b> làm việc
        </span>
        <Link className="m-sec-link" to="/m/don?type=register">
          <CalendarPlus size={13} />
          Đăng ký ca
        </Link>
      </div>

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">
            {dateLong(selected)}
            {selected === data.today ? <Badge tone="brand">Hôm nay</Badge> : null}
          </div>
          {holidayName ? <Badge tone="violet">Ngày lễ</Badge> : null}
        </div>

        {selectedShifts.length ? (
          <div className="m-shift-list">
            {selectedShifts.map(({ shift, registered }) => (
              <div
                className={`m-shift-card ${selected === data.today ? 'today' : ''}`}
                key={`${selected}-${shift.id}`}
              >
                <span className={`m-shift-code t-${shiftTone(shift.id, data.shifts.map((s) => s.id))}`}>
                  {shift.code}
                </span>
                <div className="m-shift-body">
                  <div className="m-shift-name">{shift.name}</div>
                  <div className="m-shift-time">{shiftTimeLabel(shift)}</div>
                </div>
                <span className="m-shift-state">{registered ? 'Đã đăng ký' : 'Theo lịch'}</span>
              </div>
            ))}
            {holidayName ? (
              <div className="m-banner info">
                <CalendarPlus size={15} />
                <span>Trùng ngày lễ: {holidayName}. Giờ làm và hệ số tăng ca được tính theo ngày lễ.</span>
              </div>
            ) : null}
          </div>
        ) : holidayName ? (
          <div className="m-banner info">
            <CalendarPlus size={15} />
            <span>{holidayName} — bạn được nghỉ và không có ca làm việc.</span>
          </div>
        ) : (
          <div className="m-card">
            <div className="m-empty" style={{ padding: '18px 8px' }}>
              <CalendarOff size={22} />
              <div>Không có ca làm việc trong ngày này.</div>
            </div>
          </div>
        )}
      </section>

      <div className="m-banner info">
        <CalendarPlus size={15} />
        <span>
          Lịch có thể thay đổi khi quản lý xếp ca. Đơn đăng ký hoặc đổi ca đã duyệt sẽ tự động cập nhật vào lịch.
        </span>
      </div>
    </div>
  );
}

function shiftTone(id: string, ids: string[]): string {
  const index = Math.max(0, ids.indexOf(id));
  return ['green', 'blue', 'amber', 'violet'][index % 4];
}
