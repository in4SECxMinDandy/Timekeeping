import { useMemo, useState } from 'react';
import {
  Briefcase,
  CalendarDays,
  Clock3,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Switch,
  Tabs,
  Textarea,
  useSearchFilter,
} from '../../components/ui';
import { ConfirmModal, NoAccess } from '../../components/Confirm';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/session';
import { useToast } from '../../lib/toast';
import {
  SALARY_TYPE_LABEL,
  SHIFT_CALC_LABEL,
  WEEKDAYS_SHORT,
  fmtDateVN,
  fmtMoney,
  shiftTone,
} from '../../lib/format';
import type {
  Allowance,
  Holiday,
  Position,
  PositionRow,
  PositionsData,
  Shift,
  ShiftRow,
  Tier,
} from '../../lib/types';

const SALARY_SUFFIX: Record<string, string> = {
  month: '/tháng',
  shift: '/ca',
  hour: '/giờ',
};

type Tab = 'positions' | 'shifts' | 'holidays';

interface PositionForm {
  name: string;
  salaryType: Position['salaryType'];
  baseSalary: string;
  leaveDays: string;
  standardDays: string;
  fixedBonus: string;
  flexible: boolean;
  penaltiesEnabled: boolean;
  insuranceEnabled: boolean;
  photoExempt: boolean;
  anywhere: boolean;
  shiftIds: string[];
  locationIds: string[];
  workdays: number[];
  tiers: Tier[];
  allowances: Allowance[];
  otWeekday: string;
  otSatOff: string;
  otSun: string;
  otHoliday: string;
  headcountWanted: string;
  note: string;
}

const EMPTY_POSITION: PositionForm = {
  name: '',
  salaryType: 'month',
  baseSalary: '0',
  leaveDays: '12',
  standardDays: '26',
  fixedBonus: '0',
  flexible: false,
  penaltiesEnabled: true,
  insuranceEnabled: true,
  photoExempt: false,
  anywhere: false,
  shiftIds: [],
  locationIds: [],
  workdays: [],
  tiers: [],
  allowances: [],
  otWeekday: '1.5',
  otSatOff: '2',
  otSun: '2',
  otHoliday: '3',
  headcountWanted: '0',
  note: '',
};

interface ShiftForm {
  name: string;
  code: string;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
  calc: Shift['calc'];
  standardHours: string;
  fullMinutes: string;
  halfMinutes: string;
  lateAllow: string;
  otMin: string;
  composite: boolean;
  noLate: boolean;
  note: string;
}

const EMPTY_SHIFT: ShiftForm = {
  name: '',
  code: '',
  start: '08:00',
  end: '17:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  calc: 'frame',
  standardHours: '8',
  fullMinutes: '480',
  halfMinutes: '240',
  lateAllow: '5',
  otMin: '30',
  composite: false,
  noLate: false,
  note: '',
};

function positionToForm(p: Position): PositionForm {
  return {
    name: p.name,
    salaryType: p.salaryType,
    baseSalary: String(p.baseSalary),
    leaveDays: String(p.leaveDays),
    standardDays: String(p.standardDays),
    fixedBonus: String(p.fixedBonus),
    flexible: p.flexible,
    penaltiesEnabled: p.penaltiesEnabled,
    insuranceEnabled: p.insuranceEnabled,
    photoExempt: p.photoExempt,
    anywhere: p.anywhere,
    shiftIds: p.shiftIds,
    locationIds: p.locationIds,
    workdays: p.workdays ?? [],
    tiers: p.tiers.map((t) => ({ ...t })),
    allowances: p.allowances.map((a) => ({ ...a })),
    otWeekday: String(p.otRates.weekday),
    otSatOff: String(p.otRates.satOff),
    otSun: String(p.otRates.sun),
    otHoliday: String(p.otRates.holiday),
    headcountWanted: String(p.headcountWanted ?? 0),
    note: p.note ?? '',
  };
}

function shiftToForm(s: Shift): ShiftForm {
  return {
    name: s.name,
    code: s.code,
    start: s.start,
    end: s.end,
    breakStart: s.breakStart ?? '',
    breakEnd: s.breakEnd ?? '',
    calc: s.calc,
    standardHours: String(s.standardHours),
    fullMinutes: String(s.fullMinutes),
    halfMinutes: String(s.halfMinutes),
    lateAllow: String(s.lateAllow),
    otMin: String(s.otMin),
    composite: s.composite,
    noLate: s.noLate,
    note: s.note ?? '',
  };
}

export default function PositionsPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canManage = me?.employee.role === 'admin' || me?.employee.role === 'hr';

  const { data, error, loading, reload } = useAsync<PositionsData | null>(
    () => (canManage ? api.get<PositionsData>('/api/admin/positions') : Promise.resolve(null)),
    [canManage],
  );
  const { data: shiftData, reload: reloadShifts } = useAsync<{ shifts: ShiftRow[]; holidays: Holiday[] } | null>(
    () =>
      canManage
        ? api.get<{ shifts: ShiftRow[]; holidays: Holiday[] }>('/api/admin/shifts')
        : Promise.resolve(null),
    [canManage],
  );

  const [tab, setTab] = useState<Tab>('positions');
  const [query, setQuery] = useState('');

  const [positionOpen, setPositionOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionRow | null>(null);
  const [positionForm, setPositionForm] = useState<PositionForm>(EMPTY_POSITION);
  const [positionBusy, setPositionBusy] = useState(false);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [shiftForm, setShiftForm] = useState<ShiftForm>(EMPTY_SHIFT);
  const [shiftBusy, setShiftBusy] = useState(false);

  const [removePosition, setRemovePosition] = useState<PositionRow | null>(null);
  const [removeShift, setRemoveShift] = useState<ShiftRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [removeHoliday, setRemoveHoliday] = useState<Holiday | null>(null);

  const positions = useSearchFilter(data?.positions ?? [], query, (p) => `${p.name} ${p.note ?? ''}`);
  const shifts = useSearchFilter(shiftData?.shifts ?? [], query, (s) => `${s.name} ${s.code}`);
  const holidays = useMemo(
    () =>
      [...(shiftData?.holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [shiftData],
  );

  if (!canManage) {
    return <NoAccess title="Vị trí và ca làm chỉ dành cho quản trị viên và nhân sự" />;
  }
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (loading || !data) return <LoadingBlock rows={6} />;

  const patchPosition = (patch: Partial<PositionForm>) =>
    setPositionForm((f) => ({ ...f, ...patch }));

  const openCreatePosition = () => {
    setEditingPosition(null);
    setPositionForm({
      ...EMPTY_POSITION,
      shiftIds: data.shifts[0] ? [data.shifts[0].id] : [],
      locationIds: data.locations[0] ? [data.locations[0].id] : [],
      tiers: [],
      allowances: [],
    });
    setPositionOpen(true);
  };

  const openEditPosition = (p: PositionRow) => {
    setEditingPosition(p);
    setPositionForm(positionToForm(p));
    setPositionOpen(true);
  };

  const submitPosition = async () => {
    if (!positionForm.name.trim()) {
      toast.error('Nhập tên vị trí.');
      return;
    }
    if (!positionForm.shiftIds.length) {
      toast.error('Chọn ít nhất một ca làm việc.');
      return;
    }
    setPositionBusy(true);
    try {
      const body = {
        name: positionForm.name.trim(),
        salaryType: positionForm.salaryType,
        baseSalary: Number(positionForm.baseSalary) || 0,
        leaveDays: Number(positionForm.leaveDays) || 0,
        standardDays: Number(positionForm.standardDays) || 26,
        fixedBonus: Number(positionForm.fixedBonus) || 0,
        flexible: positionForm.flexible,
        penaltiesEnabled: positionForm.penaltiesEnabled,
        insuranceEnabled: positionForm.insuranceEnabled,
        photoExempt: positionForm.photoExempt,
        anywhere: positionForm.anywhere,
        shiftIds: positionForm.shiftIds,
        locationIds: positionForm.locationIds,
        workdays: positionForm.workdays,
        tiers: positionForm.tiers.map((t) => ({
          id: t.id || undefined,
          name: t.name,
          amount: Number(t.amount) || 0,
          headcount: Number(t.headcount) || 0,
        })),
        allowances: positionForm.allowances.map((a) => ({
          id: a.id || undefined,
          name: a.name,
          amount: Number(a.amount) || 0,
          kind: a.kind,
          enabled: a.enabled,
        })),
        otRates: {
          weekday: Number(positionForm.otWeekday) || 1.5,
          satOff: Number(positionForm.otSatOff) || 2,
          sun: Number(positionForm.otSun) || 2,
          holiday: Number(positionForm.otHoliday) || 3,
        },
        headcountWanted: Number(positionForm.headcountWanted) || 0,
        note: positionForm.note,
      };
      if (editingPosition) {
        await api.patch(`/api/admin/positions/${editingPosition.id}`, body);
        toast.success('Đã cập nhật vị trí.');
      } else {
        await api.post('/api/admin/positions', body);
        toast.success('Đã tạo vị trí mới.');
      }
      setPositionOpen(false);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPositionBusy(false);
    }
  };

  const submitShift = async () => {
    if (!shiftForm.name.trim() || !shiftForm.code.trim()) {
      toast.error('Nhập tên và mã ca.');
      return;
    }
    setShiftBusy(true);
    try {
      const body = {
        name: shiftForm.name.trim(),
        code: shiftForm.code.trim().toUpperCase(),
        start: shiftForm.start,
        end: shiftForm.end,
        breakStart: shiftForm.breakStart || undefined,
        breakEnd: shiftForm.breakEnd || undefined,
        calc: shiftForm.calc,
        standardHours: Number(shiftForm.standardHours) || 8,
        fullMinutes: Number(shiftForm.fullMinutes) || 0,
        halfMinutes: Number(shiftForm.halfMinutes) || 0,
        lateAllow: Number(shiftForm.lateAllow) || 0,
        otMin: Number(shiftForm.otMin) || 0,
        composite: shiftForm.composite,
        noLate: shiftForm.noLate,
        note: shiftForm.note,
      };
      if (editingShift) {
        await api.patch(`/api/admin/shifts/${editingShift.id}`, body);
        toast.success('Đã cập nhật ca làm việc.');
      } else {
        await api.post('/api/admin/shifts', body);
        toast.success('Đã tạo ca làm việc.');
      }
      setShiftOpen(false);
      await Promise.all([reload(true), reloadShifts(true)]);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setShiftBusy(false);
    }
  };

  const deletePosition = async () => {
    if (!removePosition) return;
    setRemoveBusy(true);
    try {
      await api.del(`/api/admin/positions/${removePosition.id}`);
      toast.success('Đã xoá vị trí.');
      setRemovePosition(null);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  const deleteShift = async () => {
    if (!removeShift) return;
    setRemoveBusy(true);
    try {
      await api.del(`/api/admin/shifts/${removeShift.id}`);
      toast.success('Đã xoá ca làm việc.');
      setRemoveShift(null);
      await Promise.all([reload(true), reloadShifts(true)]);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  const addHoliday = async () => {
    if (!holidayDate || !holidayName.trim()) {
      toast.error('Chọn ngày và nhập tên ngày lễ.');
      return;
    }
    setHolidayBusy(true);
    try {
      await api.post('/api/admin/holidays', { date: holidayDate, name: holidayName.trim() });
      toast.success('Đã thêm ngày lễ.');
      setHolidayDate('');
      setHolidayName('');
      await reloadShifts(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setHolidayBusy(false);
    }
  };

  const deleteHoliday = async () => {
    if (!removeHoliday) return;
    try {
      await api.del(`/api/admin/holidays/${removeHoliday.id}`);
      toast.success('Đã xoá ngày lễ.');
      setRemoveHoliday(null);
      await reloadShifts(true);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const toggleIn = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((x) => x !== id);

  const actions =
    tab === 'positions' ? (
      <Button variant="primary" icon={Plus} onClick={openCreatePosition}>Thêm vị trí</Button>
    ) : tab === 'shifts' ? (
      <Button
        variant="primary"
        icon={Plus}
        onClick={() => {
          setEditingShift(null);
          setShiftForm(EMPTY_SHIFT);
          setShiftOpen(true);
        }}
      >
        Thêm ca
      </Button>
    ) : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cấu hình vận hành"
        title="Vị trí & ca làm"
        description="Cấu hình lương, phụ cấp, khung giờ, ngày lễ và địa điểm áp dụng cho từng vị trí."
        actions={actions}
      />

      <Tabs
        tabs={[
          { value: 'positions', label: 'Vị trí', count: data.positions.length },
          { value: 'shifts', label: 'Ca làm việc', count: shiftData?.shifts.length ?? data.shifts.length },
          { value: 'holidays', label: 'Ngày lễ', count: shiftData?.holidays.length ?? 0 },
        ]}
        value={tab}
        onChange={(v) => { setTab(v as Tab); setQuery(''); }}
      />

      {tab !== 'holidays' ? (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="toolbar-search">
            <Search size={15} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'positions' ? 'Tìm vị trí…' : 'Tìm ca làm việc…'}
            />
          </div>
          <span className="toolbar-spacer" />
        </div>
      ) : null}

      {tab === 'positions' ? (
        positions.length ? (
          <div className="pos-grid">
            {positions.map((p) => (
              <div className="pos-card" key={p.id}>
                <div className="pos-head">
                  <div>
                    <div className="pos-name">{p.name}</div>
                    <div className="pos-salary">
                      {fmtMoney(p.baseSalary)}
                      <small>{SALARY_SUFFIX[p.salaryType]}</small>
                    </div>
                  </div>
                  <Badge tone="slate">{SALARY_TYPE_LABEL[p.salaryType]}</Badge>
                </div>

                <div className="pos-metrics">
                  <div>
                    <div className="pos-metric-label">Nhân sự</div>
                    <div className="pos-metric-value">{p.employeeCount}{p.headcountWanted ? `/${p.headcountWanted}` : ''}</div>
                  </div>
                  <div>
                    <div className="pos-metric-label">Ca</div>
                    <div className="pos-metric-value">{p.shifts.length}</div>
                  </div>
                  <div>
                    <div className="pos-metric-label">Phép năm</div>
                    <div className="pos-metric-value">{p.leaveDays} ngày</div>
                  </div>
                </div>

                <div className="pos-chips">
                  {p.shifts.map((s) => (
                    <Badge key={s.id} tone="outline">{s.code}</Badge>
                  ))}
                  <Badge tone="slate">{p.standardDays} công/tháng</Badge>
                  {p.insuranceEnabled ? <Badge tone="sky">Có BH</Badge> : null}
                  {p.flexible ? <Badge tone="violet">Giờ linh hoạt</Badge> : null}
                  {p.anywhere ? <Badge tone="success">Mọi địa điểm</Badge> : null}
                </div>

                <div className="pos-foot">
                  <Button size="sm" icon={Pencil} onClick={() => openEditPosition(p)}>Sửa</Button>
                  <IconButton
                    label={p.employeeCount ? 'Vị trí đang có nhân viên' : 'Xoá vị trí'}
                    onClick={() => setRemovePosition(p)}
                    disabled={p.employeeCount > 0}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon={Briefcase}
              title="Chưa có vị trí phù hợp"
              description="Tạo vị trí để gán ca, mức lương và địa điểm chấm công."
              action={<Button variant="primary" icon={Plus} onClick={openCreatePosition}>Thêm vị trí</Button>}
            />
          </div>
        )
      ) : null}

      {tab === 'shifts' ? (
        <div className="content-grid">
          <div className="card">
            <div className="card-head is-bordered">
              <div>
                <div className="card-title"><Clock3 size={16} /> Ca làm việc</div>
                <div className="card-sub">Khung giờ, cách tính công và ngưỡng OT.</div>
              </div>
            </div>
            {shifts.length ? (
              shifts.map((s) => (
                <div className="shift-row" key={s.id}>
                  <span className={`shift-code ${shiftTone(s.id)}`}>{s.code}</span>
                  <div className="shift-copy">
                    <div className="shift-name">
                      {s.name}
                      {s.composite ? <Badge tone="violet">Ghép ca</Badge> : null}
                      {s.noLate ? <Badge tone="success">Không tính muộn</Badge> : null}
                    </div>
                    <div className="shift-meta">
                      {s.start} – {s.end}
                      {s.breakStart && s.breakEnd ? ` · nghỉ ${s.breakStart}–${s.breakEnd}` : ''} ·{' '}
                      {SHIFT_CALC_LABEL[s.calc]} · {s.standardHours} giờ
                    </div>
                    <div className="shift-used">
                      {s.usedBy.length ? `Dùng cho: ${s.usedBy.join(', ')}` : 'Chưa gán cho vị trí nào'}
                    </div>
                  </div>
                  <div className="row-tight">
                    <IconButton
                      label="Sửa ca"
                      onClick={() => {
                        setEditingShift(s);
                        setShiftForm(shiftToForm(s));
                        setShiftOpen(true);
                      }}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton label="Xoá ca" onClick={() => setRemoveShift(s)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState icon={Clock3} title="Chưa có ca phù hợp" compact />
            )}
          </div>

          <div className="rail">
            <div className="card">
              <div className="card-head is-bordered">
                <div>
                  <div className="card-title"><CalendarDays size={16} /> Ngày lễ</div>
                  <div className="card-sub">Ngày lễ được tính hệ số OT cao hơn.</div>
                </div>
              </div>
              <div className="card-body">
                <div className="stack">
                  <Field label="Ngày">
                    <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
                  </Field>
                  <Field label="Tên ngày lễ">
                    <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Ví dụ: Quốc khánh" />
                  </Field>
                  <Button variant="primary" icon={Plus} loading={holidayBusy} onClick={addHoliday} block>
                    Thêm ngày lễ
                  </Button>
                </div>
              </div>
              {holidays.length ? (
                holidays.map((h) => (
                  <div className="holiday-row" key={h.id}>
                    <span className="holiday-date">{fmtDateVN(h.date)}</span>
                    <span className="holiday-name">{h.name}</span>
                    <IconButton label="Xoá ngày lễ" onClick={() => setRemoveHoliday(h)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                ))
              ) : (
                <EmptyState icon={CalendarDays} title="Chưa cấu hình ngày lễ" compact />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'holidays' ? (
        <div className="content-grid">
          <div className="card">
            <div className="card-head is-bordered">
              <div>
                <div className="card-title"><CalendarDays size={16} /> Ngày lễ trong năm</div>
                <div className="card-sub">Những ngày này được tính là ngày lễ khi chấm công và tính lương.</div>
              </div>
            </div>
            {holidays.length ? (
              holidays.map((h) => (
                <div className="holiday-row" key={h.id}>
                  <span className="holiday-date">{fmtDateVN(h.date)}</span>
                  <span className="holiday-name">{h.name}</span>
                  <Badge tone="violet">Hệ số OT cao</Badge>
                  <IconButton label="Xoá ngày lễ" onClick={() => setRemoveHoliday(h)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))
            ) : (
              <EmptyState icon={CalendarDays} title="Chưa có ngày lễ nào" compact />
            )}
          </div>
          <div className="rail">
            <div className="card">
              <div className="card-head is-bordered">
                <div className="card-title"><Plus size={16} /> Thêm ngày lễ</div>
              </div>
              <div className="card-body">
                <div className="stack">
                  <Field label="Ngày">
                    <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
                  </Field>
                  <Field label="Tên ngày lễ">
                    <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Ví dụ: Giỗ Tổ Hùng Vương" />
                  </Field>
                  <Button variant="primary" icon={Plus} loading={holidayBusy} onClick={addHoliday} block>
                    Thêm ngày lễ
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Drawer
        open={positionOpen}
        onClose={() => setPositionOpen(false)}
        title={editingPosition ? 'Sửa vị trí' : 'Thêm vị trí'}
        description={editingPosition ? editingPosition.name : 'Cấu hình lương, ca làm và phạm vi chấm công.'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setPositionOpen(false)} disabled={positionBusy}>Huỷ</Button>
            <Button variant="primary" loading={positionBusy} onClick={submitPosition}>
              {editingPosition ? 'Lưu thay đổi' : 'Tạo vị trí'}
            </Button>
          </>
        }
      >
        <div className="form-section">
          <div className="form-section-title">Thông tin vị trí</div>
          <div className="form-grid form-grid-3">
            <Field label="Tên vị trí" required className="form-span-2">
              <Input value={positionForm.name} onChange={(e) => patchPosition({ name: e.target.value })} placeholder="Nhân viên kinh doanh" />
            </Field>
            <Field label="Loại lương">
              <Select
                value={positionForm.salaryType}
                onChange={(e) => patchPosition({ salaryType: e.target.value as Position['salaryType'] })}
              >
                {Object.entries(SALARY_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Mức lương (VND)" required>
              <Input type="number" min={0} value={positionForm.baseSalary} onChange={(e) => patchPosition({ baseSalary: e.target.value })} />
            </Field>
            <Field label="Phép năm">
              <Input type="number" min={0} value={positionForm.leaveDays} onChange={(e) => patchPosition({ leaveDays: e.target.value })} />
            </Field>
            <Field label="Công chuẩn/tháng">
              <Input type="number" min={1} value={positionForm.standardDays} onChange={(e) => patchPosition({ standardDays: e.target.value })} />
            </Field>
            <Field label="Thưởng cố định (VND)">
              <Input type="number" min={0} value={positionForm.fixedBonus} onChange={(e) => patchPosition({ fixedBonus: e.target.value })} />
            </Field>
            <Field label="Định biên mong muốn" hint="Dùng cho gợi ý tuyển dụng.">
              <Input type="number" min={0} value={positionForm.headcountWanted} onChange={(e) => patchPosition({ headcountWanted: e.target.value })} />
            </Field>
            <Field label="Ghi chú" className="form-span-2">
              <Input value={positionForm.note} onChange={(e) => patchPosition({ note: e.target.value })} placeholder="Ghi chú nội bộ" />
            </Field>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Ca làm & địa điểm</div>
          <Field label="Ca áp dụng" required>
            <div className="stack" style={{ gap: 6 }}>
              {data.shifts.map((s) => (
                <Checkbox
                  key={s.id}
                  checked={positionForm.shiftIds.includes(s.id)}
                  onChange={(v) => patchPosition({ shiftIds: toggleIn(positionForm.shiftIds, s.id, v) })}
                  label={`${s.code} · ${s.name}`}
                  description={`${s.start} – ${s.end}`}
                />
              ))}
            </div>
          </Field>
          <Field label="Ngày làm việc riêng" hint="Bỏ trống để dùng lịch làm việc của công ty.">
            <div className="workday-picker">
              {WEEKDAYS_SHORT.slice(1).map((label, i) => {
                const day = i + 1;
                const active = positionForm.workdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`workday-chip ${active ? 'is-active' : ''}`}
                    onClick={() =>
                      patchPosition({
                        workdays: active
                          ? positionForm.workdays.filter((d) => d !== day)
                          : [...positionForm.workdays, day].sort(),
                      })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Địa điểm chấm công">
            <div className="stack" style={{ gap: 6 }}>
              {data.locations.map((loc) => (
                <Checkbox
                  key={loc.id}
                  checked={positionForm.locationIds.includes(loc.id)}
                  onChange={(v) => patchPosition({ locationIds: toggleIn(positionForm.locationIds, loc.id, v) })}
                  label={loc.name}
                  description={`${loc.address} · ${loc.radius} m`}
                />
              ))}
            </div>
          </Field>
        </div>

        <div className="form-section">
          <div className="form-section-title">Bậc lương</div>
          <div className="dynamic-list">
            {positionForm.tiers.map((tier, index) => (
              <div className="dynamic-row" key={tier.id || `new-tier-${index}`}>
                <Input
                  value={tier.name}
                  onChange={(e) => {
                    const next = [...positionForm.tiers];
                    next[index] = { ...tier, name: e.target.value };
                    patchPosition({ tiers: next });
                  }}
                  placeholder="Tên bậc"
                />
                <Input
                  type="number"
                  min={0}
                  value={tier.amount}
                  onChange={(e) => {
                    const next = [...positionForm.tiers];
                    next[index] = { ...tier, amount: Number(e.target.value) || 0 };
                    patchPosition({ tiers: next });
                  }}
                  placeholder="Mức lương"
                />
                <Input
                  type="number"
                  min={0}
                  value={tier.headcount}
                  onChange={(e) => {
                    const next = [...positionForm.tiers];
                    next[index] = { ...tier, headcount: Number(e.target.value) || 0 };
                    patchPosition({ tiers: next });
                  }}
                  placeholder="Định biên"
                />
                <IconButton
                  label="Xoá bậc"
                  onClick={() => patchPosition({ tiers: positionForm.tiers.filter((_, i) => i !== index) })}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            icon={Plus}
            style={{ marginTop: 8 }}
            onClick={() =>
              patchPosition({
                tiers: [...positionForm.tiers, { id: '', name: `Bậc ${positionForm.tiers.length + 1}`, amount: 0, headcount: 0 }],
              })
            }
          >
            Thêm bậc lương
          </Button>
        </div>

        <div className="form-section">
          <div className="form-section-title">Phụ cấp</div>
          <div className="dynamic-list">
            {positionForm.allowances.map((allowance, index) => (
              <div className="dynamic-row" key={allowance.id || `new-allowance-${index}`}>
                <Input
                  value={allowance.name}
                  onChange={(e) => {
                    const next = [...positionForm.allowances];
                    next[index] = { ...allowance, name: e.target.value };
                    patchPosition({ allowances: next });
                  }}
                  placeholder="Tên phụ cấp"
                />
                <Input
                  type="number"
                  min={0}
                  value={allowance.amount}
                  onChange={(e) => {
                    const next = [...positionForm.allowances];
                    next[index] = { ...allowance, amount: Number(e.target.value) || 0 };
                    patchPosition({ allowances: next });
                  }}
                  placeholder="Số tiền"
                />
                <Select
                  value={allowance.kind}
                  onChange={(e) => {
                    const next = [...positionForm.allowances];
                    next[index] = { ...allowance, kind: e.target.value as Allowance['kind'] };
                    patchPosition({ allowances: next });
                  }}
                >
                  <option value="month">Theo tháng</option>
                  <option value="day">Theo ngày công</option>
                </Select>
                <IconButton
                  label="Xoá phụ cấp"
                  onClick={() => patchPosition({ allowances: positionForm.allowances.filter((_, i) => i !== index) })}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            icon={Plus}
            style={{ marginTop: 8 }}
            onClick={() =>
              patchPosition({
                allowances: [
                  ...positionForm.allowances,
                  { id: '', name: 'Phụ cấp', amount: 0, kind: 'month', enabled: true },
                ],
              })
            }
          >
            Thêm phụ cấp
          </Button>
        </div>

        <div className="form-section">
          <div className="form-section-title">Hệ số tăng ca</div>
          <div className="rate-grid">
            {([
              ['otWeekday', 'Ngày thường'],
              ['otSatOff', 'Thứ 7 / nghỉ'],
              ['otSun', 'Chủ nhật'],
              ['otHoliday', 'Ngày lễ'],
            ] as const).map(([key, label]) => (
              <div className="rate-box" key={key}>
                <label>{label}</label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  max={5}
                  value={positionForm[key]}
                  onChange={(e) => patchPosition({ [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Chính sách</div>
          <Switch checked={positionForm.flexible} onChange={(v) => patchPosition({ flexible: v })} label="Giờ giấc linh hoạt" description="Không tính muộn nếu đủ số giờ trong ngày." />
          <Switch checked={positionForm.penaltiesEnabled} onChange={(v) => patchPosition({ penaltiesEnabled: v })} label="Áp dụng phạt đi muộn" description="Trừ vào phần tăng ca khi đi muộn." />
          <Switch checked={positionForm.insuranceEnabled} onChange={(v) => patchPosition({ insuranceEnabled: v })} label="Trích bảo hiểm 10.5%" description="Tính trên lương cơ bản khi chốt lương." />
          <Switch checked={positionForm.photoExempt} onChange={(v) => patchPosition({ photoExempt: v })} label="Miễn ảnh chấm công" description="Nhân viên không cần chụp ảnh khi chấm công." />
          <Switch checked={positionForm.anywhere} onChange={(v) => patchPosition({ anywhere: v })} label="Chấm công mọi nơi" description="Bỏ kiểm tra bán kính địa điểm." />
        </div>

        <div className="form-section">
          <Field label="Ghi chú vị trí">
            <Textarea rows={3} value={positionForm.note} onChange={(e) => patchPosition({ note: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      <Modal
        open={shiftOpen}
        onClose={() => setShiftOpen(false)}
        title={editingShift ? 'Sửa ca làm việc' : 'Thêm ca làm việc'}
        description={editingShift ? editingShift.name : 'Khung giờ làm việc dùng cho xếp ca và tính công.'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setShiftOpen(false)} disabled={shiftBusy}>Huỷ</Button>
            <Button variant="primary" loading={shiftBusy} onClick={submitShift}>
              {editingShift ? 'Lưu thay đổi' : 'Tạo ca'}
            </Button>
          </>
        }
      >
        <div className="form-grid form-grid-3">
          <Field label="Tên ca" required className="form-span-2">
            <Input value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} placeholder="Hành chính" />
          </Field>
          <Field label="Mã ca" required hint="2–8 ký tự chữ/số.">
            <Input
              value={shiftForm.code}
              onChange={(e) => setShiftForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) }))}
              placeholder="HC"
            />
          </Field>
          <Field label="Bắt đầu" required>
            <Input type="time" value={shiftForm.start} onChange={(e) => setShiftForm((f) => ({ ...f, start: e.target.value }))} />
          </Field>
          <Field label="Kết thúc" required>
            <Input type="time" value={shiftForm.end} onChange={(e) => setShiftForm((f) => ({ ...f, end: e.target.value }))} />
          </Field>
          <Field label="Cách tính công">
            <Select value={shiftForm.calc} onChange={(e) => setShiftForm((f) => ({ ...f, calc: e.target.value as Shift['calc'] }))}>
              {Object.entries(SHIFT_CALC_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Bắt đầu nghỉ">
            <Input type="time" value={shiftForm.breakStart} onChange={(e) => setShiftForm((f) => ({ ...f, breakStart: e.target.value }))} />
          </Field>
          <Field label="Kết thúc nghỉ">
            <Input type="time" value={shiftForm.breakEnd} onChange={(e) => setShiftForm((f) => ({ ...f, breakEnd: e.target.value }))} />
          </Field>
          <Field label="Số giờ chuẩn">
            <Input type="number" step="0.5" min={0.5} max={24} value={shiftForm.standardHours} onChange={(e) => setShiftForm((f) => ({ ...f, standardHours: e.target.value }))} />
          </Field>
          <Field label="Phút đủ công">
            <Input type="number" min={0} value={shiftForm.fullMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, fullMinutes: e.target.value }))} />
          </Field>
          <Field label="Phút nửa công">
            <Input type="number" min={0} value={shiftForm.halfMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, halfMinutes: e.target.value }))} />
          </Field>
          <Field label="Cho phép muộn (phút)">
            <Input type="number" min={0} value={shiftForm.lateAllow} onChange={(e) => setShiftForm((f) => ({ ...f, lateAllow: e.target.value }))} />
          </Field>
          <Field label="Ngưỡng OT (phút)">
            <Input type="number" min={0} value={shiftForm.otMin} onChange={(e) => setShiftForm((f) => ({ ...f, otMin: e.target.value }))} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Switch checked={shiftForm.composite} onChange={(v) => setShiftForm((f) => ({ ...f, composite: v }))} label="Ca ghép" description="Ca gồm nhiều khung giờ trong ngày." />
          <Switch checked={shiftForm.noLate} onChange={(v) => setShiftForm((f) => ({ ...f, noLate: v }))} label="Không tính đi muộn" description="Bỏ qua cảnh báo muộn cho ca này." />
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Ghi chú">
            <Input value={shiftForm.note} onChange={(e) => setShiftForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={!!removePosition}
        onClose={() => setRemovePosition(null)}
        onConfirm={deletePosition}
        busy={removeBusy}
        title="Xoá vị trí?"
        description={removePosition ? `${removePosition.name} sẽ bị xoá khỏi danh sách vị trí.` : undefined}
        confirmLabel="Xoá vị trí"
      />
      <ConfirmModal
        open={!!removeShift}
        onClose={() => setRemoveShift(null)}
        onConfirm={deleteShift}
        busy={removeBusy}
        title="Xoá ca làm việc?"
        description={removeShift ? `${removeShift.code} · ${removeShift.name} sẽ bị xoá. Chỉ xoá được khi ca không còn được dùng.` : undefined}
        confirmLabel="Xoá ca"
      />
      <ConfirmModal
        open={!!removeHoliday}
        onClose={() => setRemoveHoliday(null)}
        onConfirm={deleteHoliday}
        title="Xoá ngày lễ?"
        description={removeHoliday ? `${fmtDateVN(removeHoliday.date)} · ${removeHoliday.name}` : undefined}
        confirmLabel="Xoá ngày lễ"
      />
    </div>
  );
}
