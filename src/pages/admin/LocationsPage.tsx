import { useMemo, useState } from 'react';
import {
  Building2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
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
  PageHeader,
  StatCard,
  useSearchFilter,
} from '../../components/ui';
import { ConfirmModal, NoAccess } from '../../components/Confirm';
import OfflineMap from '../../components/OfflineMap';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { fmtNumber } from '../../lib/format';
import type { Location, LocationsData } from '../../lib/types';

interface LocationForm {
  name: string;
  address: string;
  lat: string;
  lng: string;
  radius: string;
  positionIds: string[];
}

const EMPTY_FORM: LocationForm = {
  name: '',
  address: '',
  lat: '21.028500',
  lng: '105.854200',
  radius: '150',
  positionIds: [],
};

export default function LocationsPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canManage = me?.employee.role === 'admin' || me?.employee.role === 'hr';

  const { data, error, loading, reload } = useAsync<LocationsData | null>(
    () => (canManage ? api.get<LocationsData>('/api/admin/locations') : Promise.resolve(null)),
    [canManage],
  );

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Location | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const locations = useSearchFilter(data?.locations ?? [], query, (l) => `${l.name} ${l.address}`);
  const totals = useMemo(() => {
    const list = data?.locations ?? [];
    return {
      count: list.length,
      employees: list.reduce((sum, l) => sum + l.employeeCount, 0),
      maxRadius: list.reduce((max, l) => Math.max(max, l.radius), 0),
      unassigned: list.filter((l) => l.positionIds.length === 0).length,
    };
  }, [data]);

  if (!canManage) {
    return <NoAccess title="Địa điểm chấm công chỉ dành cho quản trị viên và nhân sự" />;
  }
  if (error) return <ErrorState message={error} onRetry={() => reload()} />;
  if (loading || !data) return <LoadingBlock rows={6} />;

  const patch = (p: Partial<LocationForm>) => setForm((f) => ({ ...f, ...p }));

  const openCreate = () => {
    const first = data.locations[0];
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      lat: String(first?.lat ?? 21.0285),
      lng: String(first?.lng ?? 105.8542),
      positionIds: [],
    });
    setOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      address: loc.address,
      lat: String(loc.lat),
      lng: String(loc.lng),
      radius: String(loc.radius),
      positionIds: loc.positionIds,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      toast.error('Nhập tên và địa chỉ địa điểm.');
      return;
    }
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const radius = Number(form.radius);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Toạ độ không hợp lệ.');
      return;
    }
    if (!Number.isFinite(radius) || radius < 30 || radius > 3000) {
      toast.error('Bán kính phải trong khoảng 30–3000 m.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        address: form.address.trim(),
        lat,
        lng,
        radius,
        positionIds: form.positionIds,
      };
      if (editing) {
        await api.patch(`/api/admin/locations/${editing.id}`, body);
        toast.success('Đã cập nhật địa điểm.');
      } else {
        await api.post('/api/admin/locations', body);
        toast.success('Đã thêm địa điểm chấm công.');
      }
      setOpen(false);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.del(`/api/admin/locations/${removeTarget.id}`);
      toast.success('Đã xoá địa điểm.');
      setRemoveTarget(null);
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRemoveBusy(false);
    }
  };

  const lat = Number(form.lat);
  const lng = Number(form.lng);
  const validPoint = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Chấm công theo vị trí"
        title="Địa điểm chấm công"
        description="Khai báo toạ độ và bán kính hợp lệ. Nhân viên chỉ chấm công được khi ở trong vùng cho phép."
        actions={<Button variant="primary" icon={Plus} onClick={openCreate}>Thêm địa điểm</Button>}
      />

      <div className="kpi-grid">
        <StatCard label="Địa điểm" value={totals.count} icon={MapPin} tone="brand" sub="Đang hoạt động" />
        <StatCard label="Nhân sự trong phạm vi" value={totals.employees} icon={Users} tone="success" sub="Theo vị trí hoặc gán riêng" />
        <StatCard label="Bán kính lớn nhất" value={`${fmtNumber(totals.maxRadius)} m`} icon={Building2} tone="sky" sub="Bán kính hợp lệ 30–3000 m" />
        <StatCard label="Chưa gán vị trí" value={totals.unassigned} icon={MapPin} tone="warn" sub="Không nhân viên nào dùng tới" />
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="toolbar-search">
          <Search size={15} />
          <Input placeholder="Tìm theo tên hoặc địa chỉ…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="toolbar-spacer" />
        <span className="tiny muted">{locations.length} địa điểm</span>
      </div>

      {locations.length ? (
        <div className="loc-grid">
          {locations.map((loc) => {
            const positions = data.positions.filter((p) => loc.positionIds.includes(p.id));
            return (
              <div className="loc-card" key={loc.id}>
                <div className="loc-map">
                  <OfflineMap locations={[loc]} height={132} />
                </div>
                <div className="loc-body">
                  <div className="loc-name">
                    <MapPin size={15} style={{ color: 'var(--brand)' }} />
                    {loc.name}
                  </div>
                  <div className="loc-address">{loc.address}</div>
                  <div className="loc-meta">
                    <Badge tone="outline">Bán kính {fmtNumber(loc.radius)} m</Badge>
                    <Badge tone="sky">{loc.employeeCount} nhân viên</Badge>
                    {positions.length ? (
                      positions.map((p) => <Badge key={p.id} tone="slate">{p.name}</Badge>)
                    ) : (
                      <Badge tone="warn">Chưa gán vị trí</Badge>
                    )}
                  </div>
                  <div className="loc-meta mono tiny muted">
                    {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                  </div>
                  <div className="pos-foot" style={{ marginTop: 10 }}>
                    <Button size="sm" icon={Pencil} onClick={() => openEdit(loc)}>Sửa</Button>
                    <IconButton
                      label={positions.length ? 'Bỏ gán vị trí trước khi xoá' : 'Xoá địa điểm'}
                      disabled={positions.length > 0}
                      onClick={() => setRemoveTarget(loc)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={MapPin}
            title="Chưa có địa điểm phù hợp"
            description="Thêm địa điểm để bật kiểm tra vị trí khi chấm công."
            action={<Button variant="primary" icon={Plus} onClick={openCreate}>Thêm địa điểm</Button>}
          />
        </div>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Sửa địa điểm' : 'Thêm địa điểm'}
        description={editing ? editing.name : 'Bấm trên bản đồ để chọn toạ độ, hoặc nhập trực tiếp.'}
        size="md"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>Huỷ</Button>
            <Button variant="primary" loading={busy} onClick={submit}>
              {editing ? 'Lưu thay đổi' : 'Thêm địa điểm'}
            </Button>
          </>
        }
      >
        <div className="form-section">
          <div className="form-section-title">Thông tin địa điểm</div>
          <div className="form-grid">
            <Field label="Tên địa điểm" required>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Văn phòng Hà Nội" />
            </Field>
            <Field label="Bán kính (m)" required hint="Từ 30 đến 3000 m.">
              <Input type="number" min={30} max={3000} value={form.radius} onChange={(e) => patch({ radius: e.target.value })} />
            </Field>
            <Field label="Địa chỉ" required className="form-span-2">
              <Input value={form.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Số nhà, đường, quận, thành phố" />
            </Field>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Toạ độ</div>
          <div className="form-grid">
            <Field label="Vĩ độ (lat)" required>
              <Input
                type="number"
                step="0.000001"
                value={form.lat}
                onChange={(e) => patch({ lat: e.target.value })}
              />
            </Field>
            <Field label="Kinh độ (lng)" required>
              <Input
                type="number"
                step="0.000001"
                value={form.lng}
                onChange={(e) => patch({ lng: e.target.value })}
              />
            </Field>
          </div>
          <div className="loc-map" style={{ height: 220, borderRadius: 'var(--r-md)', overflow: 'hidden', marginTop: 2 }}>
            <OfflineMap
              locations={data.locations.filter((l) => l.id !== editing?.id)}
              points={validPoint ? [{ id: 'pick', lat, lng, name: 'Vị trí mới', tone: 'brand', selected: true }] : []}
              height={220}
              onPick={(newLat, newLng) =>
                patch({ lat: newLat.toFixed(6), lng: newLng.toFixed(6) })
              }
            />
            <div className="map-pick-hint">Bấm trên bản đồ để chọn toạ độ</div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Vị trí áp dụng</div>
          <Field label="Vị trí được chấm tại địa điểm này" hint="Bỏ trống nếu chỉ gán riêng cho từng nhân viên.">
            <div className="stack" style={{ gap: 6 }}>
              {data.positions.map((p) => (
                <Checkbox
                  key={p.id}
                  checked={form.positionIds.includes(p.id)}
                  onChange={(v) =>
                    patch({
                      positionIds: v
                        ? [...form.positionIds, p.id]
                        : form.positionIds.filter((id) => id !== p.id),
                    })
                  }
                  label={p.name}
                  description={`${p.standardDays} công/tháng · ${p.tiers.length} bậc lương`}
                />
              ))}
            </div>
          </Field>
        </div>
      </Drawer>

      <ConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        busy={removeBusy}
        title="Xoá địa điểm?"
        description={removeTarget ? `${removeTarget.name} sẽ không còn dùng để kiểm tra vị trí chấm công.` : undefined}
        confirmLabel="Xoá địa điểm"
      />
    </div>
  );
}
