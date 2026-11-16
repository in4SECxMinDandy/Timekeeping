import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import {
  Badge,
  ErrorState,
  LoadingBlock,
  Sheet,
  type BadgeTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { useAuth } from '../../lib/session';
import {
  DAY_STATUS_LABEL,
  addMonths,
  currentPeriod,
  dateLong,
  fmtNumber,
  formatMinutes,
  monthRange,
  partyTime,
  periodLabel,
} from '../../lib/format';
import type { DayResult, EmployeeTimesheetData } from '../../lib/types';

const ISSUE_LABEL: Record<string, string> = {
  ot: 'Làm thêm',
  missing: 'Thiếu chấm công',
  absence: 'Vắng mặt',
  outside: 'Ngoài phạm vi',
  wrong_shift: 'Sai ca',
  late: 'Đi muộn',
  early: 'Về sớm',
  no_punch: 'Không chấm công',
};

function calendarMark(day: DayResult): { mark: string; tone: string } {
  if (day.status === 'holiday') return { mark: 'L', tone: 'holiday' };
  if (day.status === 'leave') return { mark: 'P', tone: 'leave' };
  if (day.status === 'absent') return { mark: 'V', tone: 'bad' };
  if (day.status === 'missing') return { mark: '!', tone: 'bad' };
  if (day.status === 'off' || day.status === 'future') return { mark: '', tone: 'off' };
  if (day.wrongShift) return { mark: 'C', tone: 'bad' };
  if (day.outside) return { mark: 'G', tone: 'late' };
  if (day.lateMinutes > 0 || day.earlyMinutes > 0) return { mark: 'M', tone: 'late' };
  if (day.approvedOtMinutes > 0 || day.otMinutes > 0) return { mark: '+', tone: 'ok' };
  if (day.cong > 0) return { mark: day.cong < 1 ? '½' : '✓', tone: 'ok' };
  return { mark: '', tone: 'off' };
}

function statusTone(day: DayResult): BadgeTone {
  if (day.status === 'ok') return 'success';
  if (day.status === 'late') return 'warn';
  if (day.status === 'leave') return 'sky';
  if (day.status === 'holiday') return 'violet';
  if (day.status === 'missing' || day.status === 'absent') return 'danger';
  if (day.status === 'inprogress') return 'brand';
  return 'slate';
}

export default function MobileTimesheetPage() {
  const { me } = useAuth();
  const [period, setPeriod] = useState(() => currentPeriod());
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync<EmployeeTimesheetData>(
    () => api.get(`/api/me/timesheet?period=${period}`),
    [period],
  );

  const grid = useMemo(() => {
    const range = monthRange(period);
    const offset = range.days.length ? (new Date(`${range.from}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
    const cells: (string | null)[] = Array.from({ length: offset }, () => null);
    cells.push(...range.days);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [period]);

  if (loading) {
    return (
      <div className="m-page">
        <LoadingBlock rows={6} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="m-page">
        <ErrorState message={error ?? 'Không tải được bảng công.'} onRetry={() => reload()} />
      </div>
    );
  }

  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const selectedDay = selected ? byDate.get(selected) ?? null : null;
  const standardDays = me?.position.standardDays ?? 26;
  const current = currentPeriod();

  return (
    <div className="m-page m-page-tight">
      <section className="m-cal-card">
        <div className="m-month-nav">
          <button
            type="button"
            aria-label="Tháng trước"
            onClick={() => {
              setPeriod(addMonths(period, -1));
              setSelected(null);
            }}
          >
            <ChevronLeft size={17} />
          </button>
          <div className="m-month-label">{periodLabel(period)}</div>
          <button
            type="button"
            aria-label="Tháng sau"
            disabled={period >= current}
            style={period >= current ? { opacity: 0.4 } : undefined}
            onClick={() => {
              if (period >= current) return;
              setPeriod(addMonths(period, 1));
              setSelected(null);
            }}
          >
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="m-cal-summary">
          <span>
            Công <b>{fmtNumber(data.summary.cong)}</b>/{fmtNumber(standardDays)}
          </span>
          <span>
            Đi muộn <b>{data.summary.lateDays}</b>
          </span>
          <span>
            OT <b>{formatMinutes(data.summary.otApprovedMinutes)}</b>
          </span>
          <span>
            Phép còn <b>{data.leaveBalance}</b> ngày
          </span>
        </div>

        <div className="m-cal-head">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="m-cal-grid">
          {grid.map((date, i) => {
            if (!date) return <span className="m-cal-cell empty" key={`e${i}`} />;
            const day = byDate.get(date);
            const mark = day ? calendarMark(day) : { mark: '', tone: 'off' };
            const closed = !day || day.status === 'off' || day.status === 'future';
            return (
              <button
                type="button"
                key={date}
                className={`m-cal-cell ${date === data.today ? 'today' : ''} ${
                  selected === date ? 'selected' : ''
                } ${closed ? 'off' : ''} ${
                  day && day.approvedOtMinutes > 0 && mark.mark !== '+' ? 'has-dot' : ''
                }`}
                aria-label={`${dateLong(date)}${day ? ` · ${DAY_STATUS_LABEL[day.status]}` : ''}`}
                aria-pressed={selected === date}
                onClick={() => setSelected(date)}
              >
                <span>{Number(date.slice(8))}</span>
                <span className={`m-cal-sym ${mark.tone}`}>{mark.mark}</span>
              </button>
            );
          })}
        </div>

        <div className="m-legend">
          <span><i style={{ background: 'var(--green)' }} />Đủ công</span>
          <span><i style={{ background: 'var(--amber)' }} />Muộn / về sớm</span>
          <span><i style={{ background: 'var(--red)' }} />Thiếu công</span>
          <span><i style={{ background: 'var(--sky)' }} />Nghỉ phép</span>
          <span><i style={{ background: 'var(--violet)' }} />Ngày lễ</span>
        </div>
      </section>

      {data.summary.otPendingMinutes > 0 ? (
        <div className="m-banner info">
          <AlertTriangle size={15} />
          <span>
            Bạn có {formatMinutes(data.summary.otPendingMinutes)} tăng ca đang chờ duyệt. Số giờ này chưa được tính vào bảng công.
          </span>
        </div>
      ) : null}

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">Tổng hợp tháng</div>
          <Badge tone={data.summary.missingDays ? 'warn' : 'success'}>
            {data.summary.missingDays ? `${data.summary.missingDays} ngày cần bổ sung` : 'Đã đủ dữ liệu'}
          </Badge>
        </div>
        <div className="m-card">
          <div className="m-day-rows">
            <div className="m-day-row"><span>Ngày công</span><b>{fmtNumber(data.summary.cong)} / {fmtNumber(standardDays)}</b></div>
            <div className="m-day-row"><span>Giờ làm thực tế</span><b>{formatMinutes(data.summary.workedMinutes)}</b></div>
            <div className="m-day-row"><span>Tăng ca đã duyệt</span><b>{formatMinutes(data.summary.otApprovedMinutes)}</b></div>
            <div className="m-day-row"><span>Ngày nghỉ phép</span><b>{fmtNumber(data.summary.leaveDays)}</b></div>
            <div className="m-day-row"><span>Ngày lễ</span><b>{fmtNumber(data.summary.holidayDays)}</b></div>
            <div className="m-day-row"><span>Ngày vắng</span><b>{fmtNumber(data.summary.absenceDays)}</b></div>
          </div>
        </div>
      </section>

      <Sheet
        open={!!selectedDay}
        onClose={() => setSelected(null)}
        title={selectedDay ? dateLong(selectedDay.date) : 'Chi tiết ngày'}
        description={selectedDay ? DAY_STATUS_LABEL[selectedDay.status] : undefined}
        footer={
          selectedDay && (selectedDay.status === 'missing' || selectedDay.lateMinutes > 0 || selectedDay.outside) ? (
            <div className="row" style={{ gap: 8 }}>
              {selectedDay.status === 'missing' ? (
                <Link
                  to={`/m/don?type=forgot`}
                  className="btn btn-secondary btn-md"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Báo quên chấm
                </Link>
              ) : null}
              <Link
                to="/m/don?type=explain"
                className="btn btn-primary btn-md"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Gửi giải trình
              </Link>
            </div>
          ) : undefined
        }
      >
        {selectedDay ? <DayDetail day={selectedDay} /> : null}
      </Sheet>
    </div>
  );
}

function DayDetail({ day }: { day: DayResult }) {
  const issues = day.issues.filter((i) => i.kind !== 'ot');
  return (
    <div>
      <div className="m-day-head">
        <div className="m-day-date">
          <b>{Number(day.date.slice(8))}</b>
          <span>{['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][day.weekday]}</span>
        </div>
        <div className="m-day-meta">
          <h3>{day.shiftName ?? day.holidayName ?? 'Không có ca'}</h3>
          <p>
            {day.shiftCode ? `${day.shiftCode} · ${day.shiftTime}` : day.leaveKind ?? 'Ngày nghỉ'}
          </p>
        </div>
        <Badge tone={statusTone(day)}>{DAY_STATUS_LABEL[day.status]}</Badge>
      </div>

      <div className="m-day-stats">
        <div className="m-day-stat">
          <span>Công</span>
          <b>{fmtNumber(day.cong)}</b>
        </div>
        <div className="m-day-stat">
          <span>Đi muộn</span>
          <b>{day.lateMinutes ? `${day.lateMinutes}p` : '—'}</b>
        </div>
        <div className="m-day-stat">
          <span>Tăng ca</span>
          <b>{day.approvedOtMinutes ? formatMinutes(day.approvedOtMinutes) : '—'}</b>
        </div>
      </div>

      <div className="m-day-rows">
        <div className="m-day-row"><span>Giờ vào</span><b>{partyTime(day.inAt) || '—'}</b></div>
        <div className="m-day-row"><span>Giờ ra</span><b>{partyTime(day.outAt) || '—'}</b></div>
        <div className="m-day-row"><span>Giờ làm</span><b>{formatMinutes(day.workedMinutes)}</b></div>
        <div className="m-day-row"><span>Về sớm</span><b>{day.earlyMinutes ? `${day.earlyMinutes} phút` : '—'}</b></div>
        <div className="m-day-row">
          <span>Tăng ca chờ duyệt</span>
          <b>{day.pendingOtMinutes ? formatMinutes(day.pendingOtMinutes) : '—'}</b>
        </div>
        {day.holidayName ? (
          <div className="m-day-row"><span>Ngày lễ</span><b>{day.holidayName}</b></div>
        ) : null}
        {day.outside ? (
          <div className="m-day-row">
            <span>Vị trí</span>
            <b className="m-inline" style={{ color: 'var(--red)' }}><MapPin size={13} /> Ngoài phạm vi</b>
          </div>
        ) : null}
        {day.wrongShift ? (
          <div className="m-day-row"><span>Cảnh báo</span><b style={{ color: 'var(--red)' }}>Chấm khác ca được xếp</b></div>
        ) : null}
        {day.overrideNote ? (
          <div className="m-day-row"><span>Điều chỉnh</span><b>{day.overrideNote}</b></div>
        ) : null}
        {day.requestNote ? (
          <div className="m-day-row"><span>Đơn từ</span><b>{day.requestNote}</b></div>
        ) : null}
      </div>

      {issues.length ? (
        <div className="m-banner warn" style={{ marginTop: 12 }}>
          <AlertTriangle size={15} />
          <div>
            {issues.map((issue, i) => (
              <div key={`${issue.kind}-${i}`}>
                {ISSUE_LABEL[issue.kind] ?? issue.kind}
                {issue.minutes ? ` · ${formatMinutes(issue.minutes)}` : ''}
                {issue.note ? ` · ${issue.note}` : ''}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
