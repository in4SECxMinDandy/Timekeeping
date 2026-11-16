import { useMemo, useState } from 'react';
import {
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Switch,
  useSearchFilter,
} from '../../components/ui';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useToast } from '../../lib/toast';
import {
  addDays,
  dateShort,
  dowOf,
  fmtDateVN,
  shiftTone,
  todayIct,
  WEEKDAYS,
  WEEKDAYS_SHORT,
} from '../../lib/format';
import type {
  Employee,
  ScheduleData,
  ScheduleRegistration,
  Shift,
} from '../../lib/types';

const SHIFT_TONE_COLOR: Record<string, string> = {
  'shift-a': '#1d4ed8',
  'shift-b': '#15803d',
  'shift-c': '#b45309',
  'shift-d': '#6d28d9',
  'shift-e': '#0369a1',
};

function weekStart(date: string): string {
  return addDays(date, 1 - dowOf(date));
}

function rangeLabel(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} – ${b.getUTCDate()}/${b.getUTCMonth() + 1}/${b.getUTCFullYear()}`;
  }
  return `${fmtDateVN(from)} – ${fmtDateVN(to)}`;
}

interface CellSelection {
  employee: Employee;
  date: string;
}

export default function SchedulePage() {
  const toast = useToast();
  const today = todayIct();
  const [from, setFrom] = useState(() => weekStart(today));
  const [to, setTo] = useState(() => addDays(weekStart(today), 6));
  const [query, setQuery] = useState('');
  const [positionId, setPositionId] = useState('all');
  const [cell, setCell] = useState<CellSelection | null>(null);
  const [spreadOpen, setSpreadOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, reload, setData } = useAsync<ScheduleData>(
    () => api.get(`/api/admin/schedule?from=${from}&to=${to}`),
    [from, to],
  );

  const employees = useSearchFilter(
    (data?.employees ?? []).filter((e) => e.status === 'active'),
    query,
    (e) => `${e.name} ${e.code} ${e.email}`,
  ).filter((e) => {
    if (positionId === 'all') return true;
    return e.positionId === positionId;
  });

  const counts = useMemo(() => {
    const scheduled = data?.schedules.length ?? 0;
    const registered = data?.registrations.length ?? 0;
    return { scheduled, registered };
  }, [data]);

  const goWeek = (delta: number) => {
    const next = addDays(from, delta * 7);
    setFrom(next);
    setTo(addDays(next, 6));
  };

  const goToday = () => {
    setFrom(weekStart(today));
    setTo(addDays(weekStart(today), 6));
  };

  const saveCell = async (shiftId: string | null) => {
    if (!cell) return;
    setSaving(true);
    try {
      const next = await api.put<ScheduleData>('/api/admin/schedule', {
        from: cell.date,
        to: cell.date,
        employeeIds: [cell.employee.id],
        entries: shiftId
          ? [{ employeeId: cell.employee.id, date: cell.date, shiftId }]
          : [],
      });
      setData(next);
      setCell(null);
      toast.success(shiftId ? 'Đã xếp ca.' : 'Đã bỏ ca trong ngày.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const copyWeek = async () => {
    setSaving(true);
    try {
      const next = await api.post<ScheduleData>('/api/admin/schedule/copy', { from, to });
      setData(next);
      toast.success('Đã chép lịch từ tuần trước.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            <CalendarRange size={13} /> Xếp ca
          </>
        }
        title="Lịch làm việc"
        description="Xếp ca theo tuần cho từng nhân viên. Ca đăng ký đã duyệt hiển thị viền nét đứt và được ưu tiên khi tính công."
        actions={
          <>
            <div className="period-nav">
              <button type="button" aria-label="Tuần trước" onClick={() => goWeek(-1)}>
                <ChevronLeft size={16} />
              </button>
              <span className="period-nav-label">{rangeLabel(from, to)}</span>
              <button type="button" aria-label="Tuần sau" onClick={() => goWeek(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <Button size="md" icon={CalendarRange} onClick={goToday}>
              Tuần này
            </Button>
            <Button size="md" icon={Copy} loading={saving} onClick={copyWeek}>
              Chép tuần trước
            </Button>
            <Button size="md" variant="primary" icon={Sparkles} onClick={() => setSpreadOpen(true)}>
              Phân ca nhanh
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="toolbar-search">
          <Search size={15} />
          <Input
            placeholder="Tìm nhân viên…"
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
        <span className="badge badge-outline">{counts.scheduled} ca đã xếp</span>
        <span className="badge badge-sky">{counts.registered} ca đăng ký</span>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => reload(true)}>
          Làm mới
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : loading || !data ? (
        <div className="card">
          <LoadingBlock rows={6} />
        </div>
      ) : employees.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Chưa có nhân viên"
            description="Thêm nhân viên hoặc bỏ bộ lọc để bắt đầu xếp ca."
          />
        </div>
      ) : (
        <div className="card timesheet-card">
          <div className="sch-scroll">
            <table className="table sch-table">
              <thead>
                <tr>
                  <th className="sch-name">Nhân viên</th>
                  {data.dates.map((date) => {
                    const holiday = data.holidays.find((h) => h.date === date);
                    return (
                      <th
                        key={date}
                        className={holiday ? 'is-holiday' : date === data.today ? 'is-today' : ''}
                        title={holiday?.name}
                      >
                        <div className="dow">
                          {WEEKDAYS_SHORT[dowOf(date)]}
                          {holiday ? ' · Lễ' : ''}
                        </div>
                        <div className="dnum">{fmtDateVN(date, { short: true })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="sch-name">
                      <div className="ts-row-person">
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="ts-person-name">{employee.name}</div>
                          <div className="ts-person-sub">
                            {employee.code} ·{' '}
                            {data.positions.find((p) => p.id === employee.positionId)?.name ?? '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    {data.dates.map((date) => {
                      const holiday = data.holidays.find((h) => h.date === date);
                      const shiftId = data.schedules.find(
                        (s) => s.employeeId === employee.id && s.date === date,
                      )?.shiftId;
                      const registered = data.registrations.find(
                        (r) => r.employeeId === employee.id && r.date === date,
                      );
                      const shift = data.shifts.find(
                        (s) => s.id === (registered?.shiftId ?? shiftId),
                      );
                      return (
                        <td
                          key={date}
                          className={`sch-cell ${holiday ? 'is-holiday' : ''} ${
                            date === data.today ? 'is-today' : ''
                          }`}
                          onClick={() => {
                            if (holiday) return;
                            setCell({ employee, date });
                          }}
                          title={holiday?.name ?? (shift ? `Đổi ca cho ${employee.name}` : 'Thêm ca')}
                        >
                          {holiday ? (
                            <div className="sch-holiday-label">{holiday.name}</div>
                          ) : shift ? (
                            <div
                              className={`sch-shift ${shiftTone(shift.id)} ${
                                registered ? 'is-registered' : ''
                              }`}
                            >
                              {shift.code}
                              <small>
                                {shift.start}–{shift.end}
                              </small>
                            </div>
                          ) : (
                            <div className="sch-empty">+</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sch-legend">
            {data.shifts.map((s) => (
              <span key={s.id} className="row-tight">
                <i
                  className="shift-dot"
                  style={{ background: SHIFT_TONE_COLOR[shiftTone(s.id)] }}
                />
                {s.code} · {s.name} ({s.start}–{s.end})
              </span>
            ))}
            <span className="row-tight" style={{ marginLeft: 'auto' }}>
              <i
                className="shift-dot"
                style={{ background: '#fff', border: '1px dashed #667085' }}
              />
              Ca do nhân viên đăng ký
            </span>
          </div>
        </div>
      )}

      <ShiftPickerModal
        open={!!cell}
        cell={cell}
        shifts={data?.shifts ?? []}
        registered={
          cell
            ? data?.registrations.find(
                (r) => r.employeeId === cell.employee.id && r.date === cell.date,
              )
            : undefined
        }
        currentShiftId={
          cell
            ? data?.schedules.find(
                (s) => s.employeeId === cell.employee.id && s.date === cell.date,
              )?.shiftId
            : undefined
        }
        saving={saving}
        onClose={() => setCell(null)}
        onSave={saveCell}
      />

      {data ? (
        <SpreadModal
          open={spreadOpen}
          onClose={() => setSpreadOpen(false)}
          data={data}
          from={from}
          to={to}
          onDone={(next) => {
            setData(next);
            setSpreadOpen(false);
            toast.success('Đã phân ca nhanh cho nhân viên.');
          }}
        />
      ) : null}
    </div>
  );
}

function ShiftPickerModal({
  open,
  cell,
  shifts,
  registered,
  currentShiftId,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  cell: CellSelection | null;
  shifts: Shift[];
  registered?: ScheduleRegistration;
  currentShiftId?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (shiftId: string | null) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cell ? `Xếp ca · ${cell.employee.name}` : 'Xếp ca'}
      description={cell ? dateShort(cell.date) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          {currentShiftId || registered ? (
            <Button
              variant="danger"
              icon={Trash2}
              loading={saving}
              onClick={() => onSave(null)}
            >
              Bỏ ca
            </Button>
          ) : null}
        </>
      }
    >
      {registered ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Nhân viên đã đăng ký ca này và đơn đã được duyệt. Bạn vẫn có thể đổi ca nếu cần.
        </p>
      ) : null}
      <div className="shift-picker">
        {shifts.map((s) => {
          const active = s.id === (registered?.shiftId ?? currentShiftId);
          return (
            <button
              key={s.id}
              type="button"
              className={`shift-option ${active ? 'is-selected' : ''}`}
              onClick={() => onSave(s.id)}
              disabled={saving}
            >
              <i
                className="shift-dot"
                style={{ background: SHIFT_TONE_COLOR[shiftTone(s.id)] }}
              />
              <span className="shift-option-copy">
                <span className="shift-option-name">
                  {s.code} · {s.name}
                </span>
                <span className="shift-option-time">
                  {s.start}–{s.end}
                  {s.breakStart ? ` · nghỉ ${s.breakStart}–${s.breakEnd}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function SpreadModal({
  open,
  onClose,
  data,
  from,
  to,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  data: ScheduleData;
  from: string;
  to: string;
  onDone: (next: ScheduleData) => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<number, string>>({});
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [removeOthers, setRemoveOthers] = useState(true);
  const [saving, setSaving] = useState(false);

  const active = data.employees.filter((e) => e.status === 'active');

  const submit = async () => {
    if (!selected.length) {
      toast.error('Chọn ít nhất một nhân viên.');
      return;
    }
    const payloadGroups = Object.entries(groups)
      .filter(([, shiftId]) => !!shiftId)
      .map(([weekday, shiftId]) => ({
        weekdays: [Number(weekday)],
        shiftId,
      }));
    if (!payloadGroups.length) {
      toast.error('Chọn ít nhất một ca cho một thứ.');
      return;
    }
    setSaving(true);
    try {
      const next = await api.post<ScheduleData>('/api/admin/schedule/spread', {
        from,
        to,
        employeeIds: selected,
        groups: payloadGroups,
        skipHolidays,
        removeOthers,
      });
      onDone(next);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Phân ca nhanh theo tuần"
      description={`Áp dụng cho ${dateShort(from)} – ${dateShort(to)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" loading={saving} onClick={submit} icon={CalendarPlus}>
            Áp dụng lịch
          </Button>
        </>
      }
    >
      <div className="form-section">
        <div className="form-section-title">Nhân viên áp dụng</div>
        <div className="row wrap" style={{ gap: 12 }}>
          {active.map((e) => (
            <Checkbox
              key={e.id}
              checked={selected.includes(e.id)}
              onChange={(v) =>
                setSelected((prev) =>
                  v ? [...prev, e.id] : prev.filter((id) => id !== e.id),
                )
              }
              label={e.name}
            />
          ))}
        </div>
        <div className="row-tight" style={{ marginTop: 8 }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(active.map((e) => e.id))}
          >
            Chọn tất cả
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Bỏ chọn
          </Button>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Ca theo thứ</div>
        <div className="weekday-grid">
          {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
            <div key={dow} style={{ display: 'grid', gap: 4 }}>
              <span className="center muted" style={{ fontSize: 10.5 }}>
                {WEEKDAYS[dow]}
              </span>
              <Select
                value={groups[dow] ?? ''}
                onChange={(e) =>
                  setGroups((g) => {
                    const next = { ...g };
                    if (e.target.value) next[dow] = e.target.value;
                    else delete next[dow];
                    return next;
                  })
                }
                aria-label={`Ca ${WEEKDAYS[dow]}`}
              >
                <option value="">Nghỉ</option>
                {data.shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="form-section">
        <Switch
          label="Bỏ qua ngày lễ"
          description="Không xếp ca vào các ngày lễ đã khai báo."
          checked={skipHolidays}
          onChange={setSkipHolidays}
        />
        <Switch
          label="Xoá lịch cũ trong khoảng"
          description="Thay thế toàn bộ ca đã xếp của nhân viên được chọn trong tuần này."
          checked={removeOthers}
          onChange={setRemoveOthers}
        />
      </div>
    </Modal>
  );
}
