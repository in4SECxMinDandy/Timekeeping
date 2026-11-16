import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  Search,
  UserRound,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  Switch,
  Textarea,
  useSearchFilter,
  type BadgeTone,
} from '../../components/ui';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/session';
import { useToast } from '../../lib/toast';
import {
  dateLong,
  fmtDateVN,
  fmtMoney,
  fmtNumber,
  formatMinutes,
  monthRange,
  partyTime,
  periodLabel,
  todayIct,
  WEEKDAYS_SHORT,
  dowOf,
} from '../../lib/format';
import type { DayResult, EmployeeDetailData, TimesheetData, TimesheetRow } from '../../lib/types';

const PERIOD_FROM = (period: string) => monthRange(period).from;
const PERIOD_TO = (period: string) => monthRange(period).to;

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const CELL_TONES = new Set([
  'ok',
  'late',
  'missing',
  'absent',
  'leave',
  'holiday',
  'inprogress',
  'future',
]);

function cellClass(day: DayResult, today: string): string {
  const classes = ['ts-cell'];
  const tone = CELL_TONES.has(day.status) ? day.status : 'ok';
  classes.push(`cell-${tone}`);
  if (day.weekday >= 6) classes.push('is-weekend');
  if (day.holidayName) classes.push('is-holiday');
  if (day.date === today) classes.push('is-today');
  if (!day.scheduled && (day.status === 'off' || day.status === 'future')) classes.push('is-off');
  return classes.join(' ');
}

function symbolFor(day: DayResult): string {
  if (day.status === 'holiday') return 'L';
  if (day.status === 'leave') return 'P';
  if (day.status === 'absent') return 'V';
  if (day.status === 'missing') return '!';
  if (day.outside) return 'G';
  if (day.wrongShift) return 'C';
  if (day.status === 'off' || day.status === 'future') return '';
  return fmtNumber(day.cong);
}

function statusTone(day: DayResult): BadgeTone {
  if (day.status === 'ok') return 'success';
  if (day.status === 'late') return 'warn';
  if (day.status === 'missing' || day.status === 'absent') return 'danger';
  if (day.status === 'leave') return 'sky';
  if (day.status === 'holiday') return 'violet';
  if (day.status === 'inprogress') return 'brand';
  return 'slate';
}

const STATUS_LABEL: Record<string, string> = {
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

interface Selection {
  employeeId: string;
  date: string;
}

export default function TimesheetPage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = todayIct();
  const [period, setPeriod] = useState(() => {
    const date = params.get('date');
    return date ? date.slice(0, 7) : today.slice(0, 7);
  });
  const [query, setQuery] = useState('');
  const [positionId, setPositionId] = useState('all');
  const { data, error, loading, reload } = useAsync<TimesheetData>(
    () =>
      api.get(
        `/api/admin/timesheet?from=${PERIOD_FROM(period)}&to=${PERIOD_TO(period)}`,
      ),
    [period],
  );

  const [selection, setSelection] = useState<Selection | null>(() => {
    const employeeId = params.get('employee');
    const date = params.get('date');
    return employeeId && date ? { employeeId, date } : null;
  });

  useEffect(() => {
    const employeeId = params.get('employee');
    const date = params.get('date');
    setSelection(employeeId && date ? { employeeId, date } : null);
  }, [params]);

  const openDay = (employeeId: string, date: string) => {
    const next = new URLSearchParams(params);
    next.set('employee', employeeId);
    next.set('date', date);
    setParams(next, { replace: true });
  };

  const closeDay = () => {
    const next = new URLSearchParams(params);
    next.delete('employee');
    next.delete('date');
    setParams(next, { replace: true });
  };

  const rows = useSearchFilter(data?.rows ?? [], query, (r) =>
    `${r.employee.name} ${r.employee.code} ${r.employee.email} ${r.position.name}`,
  ).filter((r) => positionId === 'all' || r.position.id === positionId);

  const totals = useMemo(() => {
    if (!data) return { cong: 0, ot: 0, late: 0, missing: 0 };
    return data.rows.reduce(
      (acc, r) => ({
        cong: acc.cong + r.totals.cong,
        ot: acc.ot + r.totals.ot,
        late: acc.late + r.totals.late,
        missing: acc.missing + r.totals.missing,
      }),
      { cong: 0, ot: 0, late: 0, missing: 0 },
    );
  }, [data]);

  const canExport = me?.employee.role === 'admin' || me?.employee.role === 'hr';

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            <CalendarDays size={13} /> Chấm công
          </>
        }
        title="Bảng công"
        description="Theo dõi công, giờ vào ra và làm thêm của từng nhân viên. Bấm vào một ô để xem chi tiết hoặc điều chỉnh."
        actions={
          <>
            <div className="period-nav">
              <button
                type="button"
                aria-label="Tháng trước"
                onClick={() => setPeriod(shiftMonth(period, -1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="period-nav-label">{periodLabel(period)}</span>
              <button
                type="button"
                aria-label="Tháng sau"
                onClick={() => setPeriod(shiftMonth(period, 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {canExport ? (
              <a
                className="btn btn-secondary btn-md"
                href={`/api/admin/export/timesheet?from=${PERIOD_FROM(period)}&to=${PERIOD_TO(period)}`}
              >
                <Download size={16} />
                <span>Xuất Excel</span>
              </a>
            ) : null}
            <Link className="btn btn-primary btn-md" to="/app/">
              <CheckCircle2 size={16} />
              <span>Duyệt công</span>
            </Link>
          </>
        }
      />

      <div className="toolbar">
        <div className="toolbar-search">
          <Search size={15} />
          <Input
            placeholder="Tìm nhân viên, mã hoặc vị trí…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm nhân viên"
          />
        </div>
        <Select
          value={positionId}
          onChange={(e) => setPositionId(e.target.value)}
          aria-label="Lọc theo vị trí"
        >
          <option value="all">Tất cả vị trí</option>
          {data?.positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <span className="toolbar-spacer" />
        <span className="badge badge-outline">
          {rows.length} nhân viên · {fmtNumber(totals.cong)} công
        </span>
        <span className="badge badge-warn">{totals.late} lượt muộn</span>
        <span className="badge badge-danger">{totals.missing} ngày thiếu</span>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : loading || !data ? (
        <div className="card">
          <LoadingBlock rows={6} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UserRound}
            title="Không có nhân viên phù hợp"
            description="Thử bỏ bộ lọc hoặc kiểm tra lại từ khoá tìm kiếm."
          />
        </div>
      ) : (
        <div className="card timesheet-card">
          <div className="ts-scroll">
            <table className="table ts-table">
              <thead>
                <tr>
                  <th className="ts-name">Nhân viên</th>
                  <th className="ts-total">Tổng</th>
                  {data.dates.map((date) => {
                    const dow = dowOf(date);
                    const holiday = data.holidays.find((h) => h.date === date);
                    return (
                      <th
                        key={date}
                        className={`ts-day ${dow >= 6 ? 'is-weekend' : ''} ${
                          holiday ? 'is-holiday' : ''
                        } ${date === data.today ? 'is-today' : ''}`}
                        title={holiday?.name}
                      >
                        <div className="dow">{WEEKDAYS_SHORT[dow]}</div>
                        <div className="dnum">{date.slice(8)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TimesheetRowView
                    key={row.employee.id}
                    row={row}
                    today={data.today}
                    selected={selection}
                    onOpenDay={openDay}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="ts-legend">
            <span>
              <i className="legend-swatch legend-ok" /> Đủ công
            </span>
            <span>
              <i className="legend-swatch legend-late" /> Đi muộn / về sớm
            </span>
            <span>
              <i className="legend-swatch legend-missing" /> Thiếu / vắng
            </span>
            <span>
              <i className="legend-swatch legend-leave" /> Nghỉ phép
            </span>
            <span>
              <i className="legend-swatch legend-holiday" /> Ngày lễ
            </span>
            <span>
              <i className="legend-swatch legend-off" /> Ngày nghỉ
            </span>
            <span>Ký hiệu: M muộn · G ngoài vùng · C sai ca · + có làm thêm</span>
          </div>
        </div>
      )}

      {selection ? (
        <DayDrawer
          selection={selection}
          onClose={closeDay}
          onChanged={() => reload(true)}
        />
      ) : null}
    </div>
  );
}

function TimesheetRowView({
  row,
  today,
  selected,
  onOpenDay,
}: {
  row: TimesheetRow;
  today: string;
  selected: Selection | null;
  onOpenDay: (employeeId: string, date: string) => void;
}) {
  return (
    <tr>
      <td className="ts-name">
        <div className="ts-row-person">
          <Avatar name={row.employee.name} size={26} toneKey={row.employee.id} />
          <div style={{ minWidth: 0 }}>
            <div className="ts-person-name">{row.employee.name}</div>
            <div className="ts-person-sub">
              {row.employee.code} · {row.position.name}
            </div>
          </div>
        </div>
      </td>
      <td className="ts-total">
        <div className="ts-total-cong">{fmtNumber(row.totals.cong)}</div>
        <div className="ts-total-sub">
          {row.totals.ot ? `+${row.totals.ot}p OT` : row.totals.late ? `${row.totals.late} muộn` : 'công'}
        </div>
      </td>
      {row.days.map((day) => {
        const isSelected =
          selected?.employeeId === row.employee.id && selected?.date === day.date;
        const time =
          day.inAt && day.outAt
            ? `${partyTime(day.inAt)}–${partyTime(day.outAt)}`
            : day.inAt
              ? `${partyTime(day.inAt)}–?`
              : day.outAt
                ? `?–${partyTime(day.outAt)}`
                : '';
        const symbol = symbolFor(day);
        return (
          <td
            key={day.date}
            className={`${cellClass(day, today)} ${isSelected ? 'is-selected' : ''}`}
            onClick={() => onOpenDay(row.employee.id, day.date)}
            title={`${fmtDateVN(day.date)} · ${STATUS_LABEL[day.status] ?? day.status}${
              day.shiftCode ? ` · ca ${day.shiftCode}` : ''
            }`}
          >
            <div className="ts-cell-inner">
              {symbol ? <span className="ts-symbol">{symbol}</span> : null}
              {time ? <span className="ts-time">{time}</span> : null}
              {!time && day.shiftCode ? <span className="ts-shift">{day.shiftCode}</span> : null}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function DayDrawer({
  selection,
  onClose,
  onChanged,
}: {
  selection: Selection;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<EmployeeDetailData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cong: '',
    otMinutes: '',
    noOt: false,
    acceptOutside: false,
    acceptShift: false,
    waiveLate: false,
    note: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get<EmployeeDetailData>(
        `/api/admin/timesheet/${selection.employeeId}?period=${selection.date.slice(0, 7)}`,
      );
      setDetail(data);
      const day = data.days.find((d) => d.date === selection.date);
      setForm({
        cong: day ? String(day.cong) : '1',
        otMinutes: day ? String(day.approvedOtMinutes || day.otMinutes || 0) : '0',
        noOt: false,
        acceptOutside: false,
        acceptShift: false,
        waiveLate: false,
        note: day?.overrideNote ?? '',
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.employeeId, selection.date]);

  const day = detail?.days.find((d) => d.date === selection.date) ?? null;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/admin/timesheet/${selection.employeeId}/${selection.date}`, {
        cong: form.cong === '' ? undefined : Number(form.cong),
        otMinutes: form.otMinutes === '' ? undefined : Number(form.otMinutes),
        noOt: form.noOt || undefined,
        acceptOutside: form.acceptOutside || undefined,
        acceptShift: form.acceptShift || undefined,
        waiveLate: form.waiveLate || undefined,
        note: form.note,
      });
      toast.success('Đã cập nhật ngày công.');
      await load();
      onChanged();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={detail ? detail.employee.name : 'Chi tiết ngày công'}
      description={`${dateLong(selection.date)}${
        detail ? ` · ${detail.position.name}` : ''
      }`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!day}>
            Lưu điều chỉnh
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingBlock rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !detail || !day ? (
        <EmptyState
          icon={AlertTriangle}
          title="Không có dữ liệu ngày này"
          description="Nhân viên có thể không thuộc phạm vi quản lý của bạn."
        />
      ) : (
        <>
          <div className="drawer-section">
            <div className="between" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <Badge tone={statusTone(day)} dot>
                {STATUS_LABEL[day.status] ?? day.status}
              </Badge>
              <span className="muted" style={{ fontSize: 12 }}>
                {day.scheduled
                  ? `Ca ${day.shiftCode ?? ''} · ${day.shiftTime ?? ''}`
                  : 'Không xếp ca'}
              </span>
            </div>
            {day.holidayName ? (
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {day.holidayName}
              </p>
            ) : null}
            {day.leaveKind ? (
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Nghỉ có đơn: {day.leaveKind}
              </p>
            ) : null}
            <div className="day-stat-grid">
              <div className="day-stat">
                <div className="day-stat-label">Công</div>
                <div className="day-stat-value">{fmtNumber(day.cong)}</div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">Giờ làm</div>
                <div className="day-stat-value">{formatMinutes(day.workedMinutes)}</div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">Đi muộn</div>
                <div className="day-stat-value">{day.lateMinutes ? `${day.lateMinutes}p` : '—'}</div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">OT</div>
                <div className="day-stat-value">
                  {day.approvedOtMinutes || day.otMinutes ? `${day.approvedOtMinutes || day.otMinutes}p` : '—'}
                </div>
              </div>
            </div>
            {day.issues.length ? (
              <div className="issue-list">
                {day.issues.map((issue, idx) => (
                  <div className="issue-line" key={idx}>
                    <AlertTriangle size={14} />
                    <span>
                      {issue.kind === 'late'
                        ? `Đi muộn ${issue.minutes ?? 0} phút`
                        : issue.kind === 'early'
                          ? `Về sớm ${issue.minutes ?? 0} phút`
                          : issue.kind === 'missing'
                            ? 'Thiếu cặp giờ vào/ra'
                            : issue.kind === 'absence'
                              ? 'Vắng không chấm công'
                              : issue.kind === 'outside'
                                ? 'Chấm ngoài vùng cho phép'
                                : issue.kind === 'wrong_shift'
                                  ? 'Giờ chấm không khớp ca'
                                  : issue.kind === 'ot'
                                    ? `Làm thêm ${issue.minutes ?? 0} phút chưa duyệt`
                                    : 'Không có lần chấm công'}
                      {issue.note ? ` · ${issue.note}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {day.requestNote || day.overrideNote ? (
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                {day.requestNote || day.overrideNote}
              </p>
            ) : null}
          </div>

          <div className="drawer-section">
            <h3 className="drawer-section-title">Lần chấm công</h3>
            {renderPunches(detail.punches.filter((p) => p.workDate === selection.date))}
          </div>

          <div className="drawer-section">
            <h3 className="drawer-section-title">Điều chỉnh công</h3>
            <div className="form-grid">
              <Field label="Công duyệt (0 – 1)">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.5}
                  value={form.cong}
                  onChange={(e) => setForm((f) => ({ ...f, cong: e.target.value }))}
                />
              </Field>
              <Field label="Phút làm thêm" hint="Đặt 0 nếu không duyệt OT.">
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  step={5}
                  value={form.otMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, otMinutes: e.target.value }))}
                />
              </Field>
            </div>
            <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
              <Switch
                label="Không tính làm thêm"
                description="Bỏ toàn bộ OT phát sinh của ngày này."
                checked={form.noOt}
                onChange={(v) => setForm((f) => ({ ...f, noOt: v }))}
              />
              <Switch
                label="Chấp nhận vị trí ngoài vùng"
                description="Bỏ cảnh báo chấm ngoài bán kính địa điểm."
                checked={form.acceptOutside}
                onChange={(v) => setForm((f) => ({ ...f, acceptOutside: v }))}
              />
              <Switch
                label="Chấp nhận ca thực tế"
                description="Công nhận giờ chấm khớp ca khác ca đã xếp."
                checked={form.acceptShift}
                onChange={(v) => setForm((f) => ({ ...f, acceptShift: v }))}
              />
              <Switch
                label="Miễn trừ đi muộn"
                description="Không trừ công vì đi muộn trong ngày này."
                checked={form.waiveLate}
                onChange={(v) => setForm((f) => ({ ...f, waiveLate: v }))}
              />
            </div>
            <Field label="Ghi chú điều chỉnh" className="mt-2">
              <Textarea
                rows={2}
                maxLength={300}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Ví dụ: đã xác nhận qua điện thoại, bổ sung công…"
              />
            </Field>
          </div>

          <div className="drawer-section">
            <h3 className="drawer-section-title">Tổng hợp tháng</h3>
            <div className="day-stat-grid">
              <div className="day-stat">
                <div className="day-stat-label">Công</div>
                <div className="day-stat-value">{fmtNumber(detail.summary.cong)}</div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">Muộn</div>
                <div className="day-stat-value">{detail.summary.lateDays}</div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">OT</div>
                <div className="day-stat-value">{formatMinutes(detail.summary.otApprovedMinutes)}</div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">Thực lĩnh</div>
                <div className="day-stat-value" style={{ fontSize: 12 }}>
                  {fmtMoney(detail.summary.net)}
                </div>
              </div>
            </div>
            <div className="slip-lines">
              {detail.summary.lines.map((line) => (
                <div className="slip-line" key={line.label}>
                  <span>{line.label}</span>
                  <span className="money">{fmtMoney(line.amount)}</span>
                </div>
              ))}
              <div className="slip-line slip-total">
                <span>Thực lĩnh tạm tính</span>
                <span className="money">{fmtMoney(detail.summary.net)}</span>
              </div>
            </div>
          </div>

          <div className="drawer-section">
            <h3 className="drawer-section-title">Đơn từ gần đây</h3>
            {detail.requests.length === 0 ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Nhân viên chưa gửi đơn nào.
              </p>
            ) : (
              <>
                {detail.requests.slice(0, 5).map((r) => (
                  <div className="punch-line" key={r.id}>
                    <FileWarning size={14} />
                    <span className="grow">
                      {r.type === 'leave' ? 'Nghỉ phép' : r.type === 'ot' ? 'Làm thêm' : r.type === 'late_early' ? 'Đi muộn/về sớm' : r.type === 'forgot' ? 'Quên chấm công' : r.type === 'swap' ? 'Đổi ca' : r.type === 'register' ? 'Đăng ký ca' : 'Giải trình'} · {fmtDateVN(r.createdAt.slice(0, 10))}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                    </span>
                    <Badge
                      tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warn' : 'danger'}
                    >
                      {r.status === 'approved' ? 'Đã duyệt' : r.status === 'pending' ? 'Chờ duyệt' : 'Từ chối'}
                    </Badge>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

function renderPunches(punches: EmployeeDetailData['punches']) {
  if (!punches.length) {
    return (
      <p className="muted" style={{ fontSize: 12 }}>
        Không có lần chấm công nào trong ngày.
      </p>
    );
  }
  return punches.map((p) => (
    <div className="punch-line" key={p.id}>
      <span className={`punch-kind ${p.kind === 'in' ? 'punch-kind-in' : 'punch-kind-out'}`}>
        {p.kind === 'in' ? 'VÀO' : 'RA'}
      </span>
      <span className="punch-time">{partyTime(p.at)}</span>
      {p.outside ? <Badge tone="warn">Ngoài vùng</Badge> : null}
      {p.photo ? (
        <img className="punch-photo" src={p.photo} alt="Ảnh chấm công" />
      ) : p.note ? (
        <Camera size={13} className="muted" />
      ) : null}
      <span className="punch-meta">
        {p.distance !== undefined ? `${p.distance} m` : ''}
        {p.note ? ` · ${p.note}` : ''}
      </span>
    </div>
  ));
}
