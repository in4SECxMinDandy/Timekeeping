import { useMemo, useState } from 'react';
import {
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Smartphone,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  CopyButton,
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
  StatCard,
  Textarea,
  useSearchFilter,
} from '../../components/ui';
import { ConfirmModal, NoAccess } from '../../components/Confirm';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/session';
import { useToast } from '../../lib/toast';
import {
  PHOTO_POLICY_LABEL,
  ROLE_LABEL,
  ROLE_TONE,
  dateShort,
  fmtMoney,
  fmtNumber,
  todayIct,
} from '../../lib/format';
import type {
  EmployeesData,
  EmployeeListItem,
  LocationsData,
  ShiftRow,
} from '../../lib/types';

const ROLES = ['admin', 'hr', 'manager', 'employee'] as const;

interface EmployeeForm {
  name: string;
  email: string;
  role: string;
  positionId: string;
  managerId: string;
  status: 'active' | 'inactive';
  startDate: string;
  contract: string;
  tierId: string;
  salaryOverride: string;
  shiftOverrideId: string;
  locationOverrideIds: string[];
  photoPolicy: 'company' | 'required' | 'exempt';
  pin: string;
}

const EMPTY_FORM: EmployeeForm = {
  name: '',
  email: '',
  role: 'employee',
  positionId: '',
  managerId: '',
  status: 'active',
  startDate: todayIct(),
  contract: 'Toàn thời gian',
  tierId: '',
  salaryOverride: '',
  shiftOverrideId: '',
  locationOverrideIds: [],
  photoPolicy: 'company',
  pin: '',
};

export default function EmployeesPage() {
  const { me } = useAuth();
  const toast = useToast();
  const actor = me?.employee;
  const canManage = actor?.role === 'admin' || actor?.role === 'hr';
  const isAdmin = actor?.role === 'admin';

  const { data, error, loading, reload } = useAsync<EmployeesData>(
    () => api.get('/api/admin/employees'),
    [],
  );

  const { data: meta } = useAsync<{ shifts: ShiftRow[]; locations: LocationsData['locations'] }>(
    () =>
      canManage
        ? Promise.all([
            api.get<{ shifts: ShiftRow[] }>('/api/admin/shifts'),
            api.get<LocationsData>('/api/admin/locations'),
          ]).then(([shifts, locations]) => ({
            shifts: shifts.shifts,
            locations: locations.locations,
          }))
        : Promise.resolve({ shifts: [], locations: [] }),
    [canManage],
  );

  const [query, setQuery] = useState('');
  const [positionId, setPositionId] = useState('all');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [role, setRole] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeListItem | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [pinTarget, setPinTarget] = useState<EmployeeListItem | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinCustom, setPinCustom] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [revealedPin, setRevealedPin] = useState<{ name: string; pin: string } | null>(null);

  const [removeTarget, setRemoveTarget] = useState<EmployeeListItem | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkPosition, setBulkPosition] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    created: { email: string; name: string; pin: string }[];
    errors: { row: number; message: string }[];
  } | null>(null);

  const rows = useSearchFilter(data?.employees ?? [], query, (e) =>
    `${e.name} ${e.code} ${e.email} ${e.positionName}`,
  )
    .filter((e) => positionId === 'all' || e.positionId === positionId)
    .filter((e) => status === 'all' || e.status === status)
    .filter((e) => role === 'all' || e.role === role);

  const counts = useMemo(() => {
    const list = data?.employees ?? [];
    return {
      total: list.length,
      active: list.filter((e) => e.status === 'active').length,
      locked: list.filter((e) => e.hasDevice).length,
      managers: list.filter((e) => e.role === 'manager' || e.role === 'admin').length,
    };
  }, [data]);

  const selectedPosition = data?.positions.find((p) => p.id === form.positionId);

  if (!canManage && actor?.role !== 'manager') {
    return <NoAccess title="Nhân sự chỉ dành cho quản trị viên và nhân sự" />;
  }

  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (loading || !data) return <LoadingBlock rows={6} />;

  const patchForm = (patch: Partial<EmployeeForm>) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, positionId: data.positions[0]?.id ?? '' });
    setFormOpen(true);
  };

  const openEdit = (employee: EmployeeListItem) => {
    setEditing(employee);
    setForm({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      positionId: employee.positionId,
      managerId: employee.managerId ?? '',
      status: employee.status,
      startDate: employee.startDate,
      contract: employee.contract,
      tierId: employee.tierId ?? '',
      salaryOverride: employee.salaryOverride === undefined ? '' : String(employee.salaryOverride),
      shiftOverrideId: employee.shiftOverrideId ?? '',
      locationOverrideIds: employee.locationOverrideIds ?? [],
      photoPolicy: employee.photoPolicy,
      pin: '',
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.positionId) {
      toast.error('Nhập họ tên, email và chọn vị trí.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        positionId: form.positionId,
        managerId: form.managerId || null,
        status: form.status,
        startDate: form.startDate,
        contract: form.contract,
        tierId: form.tierId || null,
        salaryOverride: form.salaryOverride === '' ? null : Number(form.salaryOverride),
        shiftOverrideId: form.shiftOverrideId || null,
        locationOverrideIds: form.locationOverrideIds,
        photoPolicy: form.photoPolicy,
        ...(form.pin ? { pin: form.pin } : {}),
      };
      if (editing) {
        await api.patch(`/api/admin/employees/${editing.id}`, body);
        toast.success('Đã cập nhật hồ sơ nhân viên.');
      } else {
        const result = await api.post<{ employee: EmployeeListItem; pin: string }>(
          '/api/admin/employees',
          body,
        );
        toast.success('Đã thêm nhân viên mới.');
        setRevealedPin({ name: result.employee.name, pin: result.pin });
      }
      setFormOpen(false);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const submitPin = async () => {
    if (!pinTarget) return;
    if (pinCustom && !/^\d{4,8}$/.test(pinCustom)) {
      toast.error('PIN gồm 4–8 chữ số.');
      return;
    }
    setPinBusy(true);
    try {
      const result = await api.post<{ pin: string }>(
        `/api/admin/employees/${pinTarget.id}/reset-pin`,
        pinCustom ? { pin: pinCustom } : {},
      );
      setPinOpen(false);
      setPinCustom('');
      setRevealedPin({ name: pinTarget.name, pin: result.pin });
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPinBusy(false);
    }
  };

  const unlock = async (employee: EmployeeListItem) => {
    try {
      await api.post(`/api/admin/employees/${employee.id}/unlock`);
      toast.success(`Đã mở khoá thiết bị cho ${employee.name}.`);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const unlockAll = async () => {
    try {
      const result = await api.post<{ count: number }>('/api/admin/employees/unlock-all');
      toast.success(
        result.count
          ? `Đã mở khoá ${result.count} thiết bị.`
          : 'Không có thiết bị nào đang bị khoá.',
      );
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.del(`/api/admin/employees/${removeTarget.id}`);
      toast.success(`Đã vô hiệu hoá ${removeTarget.name}.`);
      setRemoveTarget(null);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  const submitBulk = async () => {
    const rows = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = '', email = '', positionName = ''] = line.split(/\s*[|,;\t]\s*/);
        return { name, email, positionName };
      });
    if (!rows.length) {
      toast.error('Dán danh sách nhân viên trước khi nhập.');
      return;
    }
    setBulkBusy(true);
    try {
      const result = await api.post<typeof bulkResult>('/api/admin/employees/bulk', {
        rows,
        positionId: bulkPosition || undefined,
      });
      setBulkResult(result);
      await reload(true);
      if (result?.created.length) toast.success(`Đã thêm ${result.created.length} nhân viên.`);
      if (result?.errors.length) toast.error(`${result.errors.length} dòng chưa nhập được.`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Quản trị nhân sự"
        title="Nhân sự"
        description="Quản lý hồ sơ, vai trò, thiết bị chấm công và chính sách ảnh của từng nhân viên."
        actions={
          canManage ? (
            <>
              <Button icon={Upload} onClick={() => { setBulkOpen(true); setBulkResult(null); }}>
                Nhập hàng loạt
              </Button>
              <Button variant="primary" icon={UserPlus} onClick={openCreate}>
                Thêm nhân viên
              </Button>
            </>
          ) : (
            <Badge tone="slate">Chỉ xem</Badge>
          )
        }
      />

      <div className="kpi-grid">
        <StatCard label="Tổng nhân sự" value={counts.total} icon={Users} tone="brand" sub="Bao gồm cả đã vô hiệu" />
        <StatCard label="Đang hoạt động" value={counts.active} icon={UserCheck} tone="success" sub={`${counts.total ? Math.round((counts.active / counts.total) * 100) : 0}% hồ sơ`} />
        <StatCard label="Thiết bị đã gắn" value={counts.locked} icon={Smartphone} tone="warn" sub="Thiết bị bị khoá theo tài khoản" />
        <StatCard label="Quản lý & quản trị" value={counts.managers} icon={ShieldAlert} tone="violet" sub="Có quyền duyệt và xem nhóm" />
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="toolbar-search">
          <Search size={15} />
          <Input
            placeholder="Tìm theo tên, mã, email, vị trí…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
          <option value="all">Tất cả vị trí</option>
          {data.positions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã vô hiệu</option>
        </Select>
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">Mọi vai trò</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </Select>
        <span className="toolbar-spacer" />
        {canManage && counts.locked > 0 ? (
          <Button size="sm" icon={Lock} onClick={unlockAll}>
            Mở khoá tất cả ({counts.locked})
          </Button>
        ) : null}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Vị trí</th>
                <th>Quản lý</th>
                <th>Vai trò</th>
                <th>Thiết bị</th>
                <th>Bắt đầu</th>
                <th>Trạng thái</th>
                {canManage ? <th className="right">Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const lockedAdmin = !isAdmin && (e.role === 'admin' || e.role === 'hr');
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="employee-cell">
                        <Avatar name={e.name} size={32} toneKey={e.id} />
                        <div className="employee-cell-copy">
                          <div className="employee-name">
                            {e.name}
                            {e.id === actor?.id ? <Badge tone="brand">Bạn</Badge> : null}
                          </div>
                          <div className="employee-email">{e.email} · {e.code}</div>
                        </div>
                      </div>
                    </td>
                    <td>{e.positionName}</td>
                    <td className="muted">{e.managerName ?? '—'}</td>
                    <td><Badge tone={ROLE_TONE[e.role]}>{ROLE_LABEL[e.role]}</Badge></td>
                    <td>
                      {e.hasDevice ? (
                        <span className="device-chip is-locked" title={e.deviceLabel ?? 'Thiết bị đã gắn'}>
                          <Smartphone size={12} />
                          <span className="truncate" style={{ maxWidth: 120 }}>{e.deviceLabel ?? 'Đã gắn'}</span>
                        </span>
                      ) : (
                        <span className="device-chip">Chưa gắn</span>
                      )}
                    </td>
                    <td className="mono muted">{dateShort(e.startDate)}</td>
                    <td>
                      <Badge tone={e.status === 'active' ? 'success' : 'slate'} dot>
                        {e.status === 'active' ? 'Hoạt động' : 'Vô hiệu'}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td>
                        <div className="table-actions">
                          <IconButton
                            label={lockedAdmin ? 'Chỉ quản trị viên được sửa tài khoản này' : 'Sửa hồ sơ'}
                            onClick={() => openEdit(e)}
                            disabled={lockedAdmin}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton label="Đặt lại PIN" onClick={() => { setPinTarget(e); setPinOpen(true); }} disabled={lockedAdmin}>
                            <KeyRound size={15} />
                          </IconButton>
                          {e.hasDevice ? (
                            <IconButton label="Mở khoá thiết bị" onClick={() => unlock(e)} disabled={lockedAdmin}>
                              <Smartphone size={15} />
                            </IconButton>
                          ) : null}
                          {e.id !== actor?.id && e.status === 'active' ? (
                            <IconButton label="Vô hiệu hoá" onClick={() => setRemoveTarget(e)} disabled={lockedAdmin}>
                              <UserX size={15} />
                            </IconButton>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Không có nhân viên phù hợp"
            description="Thử xoá bộ lọc hoặc thêm nhân viên mới."
            compact
          />
        ) : null}
      </div>

      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Sửa hồ sơ nhân viên' : 'Thêm nhân viên'}
        description={editing ? `${editing.name} · ${editing.code}` : 'Tài khoản đăng nhập bằng email và PIN 4–8 chữ số.'}
        size="lg"
        footer={
          <>
            <Button onClick={() => setFormOpen(false)} disabled={saving}>Huỷ</Button>
            <Button variant="primary" loading={saving} onClick={submitForm}>
              {editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
            </Button>
          </>
        }
      >
        <div className="form-section">
          <div className="form-section-title">Thông tin cá nhân</div>
          <div className="form-grid">
            <Field label="Họ tên" required htmlFor="emp-name">
              <Input id="emp-name" value={form.name} onChange={(e) => patchForm({ name: e.target.value })} placeholder="Nguyễn Văn A" />
            </Field>
            <Field label="Email đăng nhập" required htmlFor="emp-email">
              <Input
                id="emp-email"
                type="email"
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                placeholder="ten@congty.vn"
              />
            </Field>
            <Field label="Ngày bắt đầu" htmlFor="emp-start">
              <Input id="emp-start" type="date" value={form.startDate} onChange={(e) => patchForm({ startDate: e.target.value })} />
            </Field>
            <Field label="Hợp đồng" htmlFor="emp-contract">
              <Input id="emp-contract" value={form.contract} onChange={(e) => patchForm({ contract: e.target.value })} placeholder="Toàn thời gian" />
            </Field>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Công việc & phân quyền</div>
          <div className="form-grid">
            <Field label="Vị trí" required>
              <Select
                value={form.positionId}
                onChange={(e) => patchForm({ positionId: e.target.value, tierId: '' })}
              >
                <option value="">Chọn vị trí</option>
                {data.positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Vai trò" hint={isAdmin ? undefined : 'Chỉ quản trị viên được gán quyền quản trị/nhân sự.'}>
              <Select value={form.role} onChange={(e) => patchForm({ role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r} disabled={!isAdmin && (r === 'admin' || r === 'hr')}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quản lý trực tiếp">
              <Select value={form.managerId} onChange={(e) => patchForm({ managerId: e.target.value })}>
                <option value="">Không gán</option>
                {data.managers
                  .filter((m) => m.id !== editing?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </Select>
            </Field>
            <Field label="Trạng thái">
              <Select
                value={form.status}
                onChange={(e) => patchForm({ status: e.target.value as EmployeeForm['status'] })}
                disabled={editing?.id === actor?.id}
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Vô hiệu hoá</option>
              </Select>
            </Field>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Lương & chấm công</div>
          <div className="form-grid">
            <Field label="Bậc lương" hint={selectedPosition ? `Chuẩn ${fmtNumber(selectedPosition.standardDays)} công/tháng` : 'Chọn vị trí để xem bậc lương'}>
              <Select value={form.tierId} onChange={(e) => patchForm({ tierId: e.target.value })}>
                <option value="">Theo cấu hình vị trí</option>
                {(selectedPosition?.tiers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {fmtMoney(t.amount)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Lương riêng (VND)" hint="Bỏ trống để dùng mức lương của vị trí/bậc.">
              <Input
                type="number"
                min={0}
                value={form.salaryOverride}
                onChange={(e) => patchForm({ salaryOverride: e.target.value })}
                placeholder="Không ghi đè"
              />
            </Field>
            <Field label="Chính sách ảnh">
              <Select
                value={form.photoPolicy}
                onChange={(e) => patchForm({ photoPolicy: e.target.value as EmployeeForm['photoPolicy'] })}
              >
                {Object.entries(PHOTO_POLICY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ca riêng" hint="Bỏ trống để theo vị trí.">
              <Select value={form.shiftOverrideId} onChange={(e) => patchForm({ shiftOverrideId: e.target.value })}>
                <option value="">Theo vị trí</option>
                {(meta?.shifts ?? []).map((s: ShiftRow) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          {(meta?.locations ?? []).length ? (
            <Field label="Giới hạn địa điểm" hint="Không chọn để dùng địa điểm của vị trí.">
              <div className="stack" style={{ gap: 6 }}>
                {(meta?.locations ?? []).map((loc) => (
                  <Checkbox
                    key={loc.id}
                    checked={form.locationOverrideIds.includes(loc.id)}
                    onChange={(v) =>
                      patchForm({
                        locationOverrideIds: v
                          ? [...form.locationOverrideIds, loc.id]
                          : form.locationOverrideIds.filter((id) => id !== loc.id),
                      })
                    }
                    label={loc.name}
                    description={`${loc.address} · bán kính ${loc.radius} m`}
                  />
                ))}
              </div>
            </Field>
          ) : null}
        </div>

        {!editing ? (
          <div className="form-section">
            <div className="form-section-title">Bảo mật</div>
            <Field label="PIN ban đầu" hint="Để trống để hệ thống tạo PIN ngẫu nhiên và hiển thị sau khi lưu.">
              <Input
                value={form.pin}
                onChange={(e) => patchForm({ pin: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                inputMode="numeric"
                placeholder="4–8 chữ số"
              />
            </Field>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setPinCustom(''); }}
        title="Đặt lại PIN"
        description={pinTarget ? `${pinTarget.name} · ${pinTarget.email}` : undefined}
        size="sm"
        footer={
          <>
            <Button onClick={() => { setPinOpen(false); setPinCustom(''); }} disabled={pinBusy}>Huỷ</Button>
            <Button variant="primary" loading={pinBusy} onClick={submitPin}>Đặt lại PIN</Button>
          </>
        }
      >
        <Field label="PIN mới" hint="Để trống để tạo PIN ngẫu nhiên. Thiết bị đã gắn sẽ được mở khoá.">
          <Input
            value={pinCustom}
            onChange={(e) => setPinCustom(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            placeholder="4–8 chữ số"
            autoFocus
          />
        </Field>
      </Modal>

      <Modal
        open={!!revealedPin}
        onClose={() => setRevealedPin(null)}
        title="PIN đăng nhập"
        description={revealedPin ? `Gửi PIN này cho ${revealedPin.name}. PIN chỉ hiển thị một lần.` : undefined}
        size="sm"
        footer={<Button variant="primary" onClick={() => setRevealedPin(null)}>Đã lưu</Button>}
      >
        <div className="pin-reveal">
          <ShieldAlert size={22} style={{ color: 'var(--amber-600)' }} />
          <div className="pin-value">{revealedPin?.pin}</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <CopyButton text={revealedPin?.pin ?? ''} label="Sao chép PIN" />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        busy={removeBusy}
        title="Vô hiệu hoá nhân viên?"
        description={removeTarget ? `${removeTarget.name} sẽ không thể đăng nhập. Dữ liệu chấm công và bảng lương được giữ nguyên.` : undefined}
        confirmLabel="Vô hiệu hoá"
      />

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Nhập nhân viên hàng loạt"
        description="Mỗi dòng: Họ tên, email, vị trí (có thể bỏ trống vị trí để dùng vị trí mặc định)."
        size="lg"
        footer={
          <>
            <Button onClick={() => setBulkOpen(false)} disabled={bulkBusy}>Đóng</Button>
            <Button variant="primary" icon={Plus} loading={bulkBusy} onClick={submitBulk}>
              Nhập danh sách
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Vị trí mặc định" hint="Dùng khi dòng dữ liệu không ghi vị trí.">
            <Select value={bulkPosition} onChange={(e) => setBulkPosition(e.target.value)}>
              <option value="">Vị trí đầu tiên</option>
              {data.positions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Danh sách nhân viên" hint="Tối đa 50 dòng. PIN được tạo tự động cho từng người.">
            <Textarea
              rows={8}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Nguyễn Văn An, an@anphat.vn, Nhân viên kinh doanh\nTrần Thị Bình, binh@anphat.vn, Kế toán'}
              className="mono"
            />
          </Field>
          {bulkResult ? (
            <div className="bulk-result">
              {bulkResult.created.length ? (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="form-section-title">Đã tạo {bulkResult.created.length} tài khoản</div>
                  {bulkResult.created.map((c) => (
                    <div className="row between" key={c.email}>
                      <span className="tiny">
                        <span className="strong">{c.name}</span> · {c.email}
                      </span>
                      <span className="row-tight">
                        <code className="pin-value" style={{ fontSize: 15, letterSpacing: '0.2em', margin: 0 }}>{c.pin}</code>
                        <CopyButton text={c.pin} label="" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {bulkResult.errors.length ? (
                <div className="stack" style={{ gap: 4, marginTop: 10 }}>
                  <div className="form-section-title" style={{ color: 'var(--red)' }}>Dòng lỗi</div>
                  {bulkResult.errors.map((e) => (
                    <div className="tiny" key={`${e.row}-${e.message}`} style={{ color: 'var(--red)' }}>
                      Dòng {e.row}: {e.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
