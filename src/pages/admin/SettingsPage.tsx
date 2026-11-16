import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  Check,
  Clock3,
  Database,
  Link2,
  Palette,
  Save,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Switch,
} from '../../components/ui';
import { NoAccess } from '../../components/Confirm';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { WEEKDAYS_SHORT } from '../../lib/format';
import type { Settings, SettingsData } from '../../lib/types';

interface FormState {
  companyName: string;
  companyCode: string;
  appName: string;
  address: string;
  brandColor: string;
  logoUrl: string;
  workdays: number[];
  lateMode: Settings['lateMode'];
  lateExplain: boolean;
  allowEarlyOT: boolean;
  autoOtFromRequest: boolean;
  otMinMinutes: string;
  requirePhoto: boolean;
  payCloseDay: string;
  payrollEnabled: boolean;
  sheetUrl: string;
  driveUrl: string;
}

const EMPTY: FormState = {
  companyName: '',
  companyCode: '',
  appName: '',
  address: '',
  brandColor: '#1A73E8',
  logoUrl: '',
  workdays: [],
  lateMode: 'full',
  lateExplain: true,
  allowEarlyOT: true,
  autoOtFromRequest: true,
  otMinMinutes: '30',
  requirePhoto: false,
  payCloseDay: '5',
  payrollEnabled: true,
  sheetUrl: '',
  driveUrl: '',
};

function toForm(data: SettingsData): FormState {
  return {
    companyName: data.company.name,
    companyCode: data.company.code,
    appName: data.company.appName,
    address: data.company.address,
    brandColor: data.company.brandColor,
    logoUrl: data.company.logoUrl ?? '',
    workdays: data.settings.workdays,
    lateMode: data.settings.lateMode,
    lateExplain: data.settings.lateExplain,
    allowEarlyOT: data.settings.allowEarlyOT,
    autoOtFromRequest: data.settings.autoOtFromRequest,
    otMinMinutes: String(data.settings.otMinMinutes),
    requirePhoto: data.settings.requirePhoto,
    payCloseDay: String(data.settings.payCloseDay),
    payrollEnabled: data.settings.payrollEnabled,
    sheetUrl: data.settings.sheetUrl ?? '',
    driveUrl: data.settings.driveUrl ?? '',
  };
}

export default function SettingsPage() {
  const { me, applyCompany, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const role = me?.employee.role;
  const canView = role === 'admin' || role === 'hr';
  const canEdit = role === 'admin';

  const { data, error, loading, reload } = useAsync<SettingsData | null>(
    () => (canView ? api.get<SettingsData>('/api/admin/settings') : Promise.resolve(null)),
    [canView],
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (!canView) {
    return <NoAccess title="Cài đặt chỉ dành cho quản trị viên và nhân sự" />;
  }
  if (error) {
    return (
      <div className="page">
        <PageHeader title="Cài đặt công ty" />
        <div className="card">
          <div className="card-body">
            <p className="muted">{error}</p>
            <Button style={{ marginTop: 10 }} onClick={() => reload()}>Thử lại</Button>
          </div>
        </div>
      </div>
    );
  }
  if (loading || !data) return <LoadingBlock rows={8} />;

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const save = async () => {
    if (!canEdit) return;
    if (!form.companyName.trim() || !form.appName.trim() || !form.companyCode.trim()) {
      toast.error('Nhập tên công ty, mã công ty và tên ứng dụng.');
      return;
    }
    if (!form.workdays.length) {
      toast.error('Chọn ít nhất một ngày làm việc.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.patch<SettingsData>('/api/admin/settings', {
        company: {
          name: form.companyName.trim(),
          code: form.companyCode.trim().toUpperCase(),
          appName: form.appName.trim(),
          address: form.address,
          brandColor: form.brandColor,
          logoUrl: form.logoUrl,
        },
        settings: {
          workdays: form.workdays,
          lateMode: form.lateMode,
          lateExplain: form.lateExplain,
          allowEarlyOT: form.allowEarlyOT,
          autoOtFromRequest: form.autoOtFromRequest,
          otMinMinutes: Number(form.otMinMinutes) || 0,
          requirePhoto: form.requirePhoto,
          payCloseDay: Number(form.payCloseDay) || 0,
          payrollEnabled: form.payrollEnabled,
          sheetUrl: form.sheetUrl,
          driveUrl: form.driveUrl,
        },
      });
      applyCompany(result.company, result.settings);
      toast.success('Đã lưu cài đặt công ty.');
      await reload(true);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (resetText !== 'RESET') return;
    setResetBusy(true);
    try {
      await api.post('/api/admin/reset', { confirm: 'RESET' });
      toast.success('Đã khôi phục dữ liệu demo. Vui lòng đăng nhập lại.');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(errorText(err));
      setResetBusy(false);
    }
  };

  const toggleDay = (day: number) =>
    patch({
      workdays: form.workdays.includes(day)
        ? form.workdays.filter((d) => d !== day)
        : [...form.workdays, day].sort(),
    });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Hệ thống"
        title="Cài đặt công ty"
        description="Thông tin thương hiệu, khung làm việc và quy tắc chấm công áp dụng cho toàn công ty."
        actions={
          canEdit ? (
            <Button variant="primary" icon={Save} loading={saving} onClick={save}>
              Lưu cài đặt
            </Button>
          ) : (
            <Badge tone="warn">Chỉ quản trị viên được sửa</Badge>
          )
        }
      />

      <div className="settings-grid">
        <div className="settings-stack">
          <section className="card setting-section">
            <div className="setting-section-head">
              <div className="setting-section-title"><Building2 size={15} /> Thông tin công ty</div>
              <div className="setting-section-desc">Hiển thị trên đăng nhập, thanh bên và ứng dụng nhân viên.</div>
            </div>
            <div className="form-grid">
              <Field label="Tên công ty" required>
                <Input value={form.companyName} onChange={(e) => patch({ companyName: e.target.value })} disabled={!canEdit} />
              </Field>
              <Field label="Mã công ty" required hint="Dùng khi đăng nhập.">
                <Input
                  value={form.companyCode}
                  onChange={(e) => patch({ companyCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Tên ứng dụng" required>
                <Input value={form.appName} onChange={(e) => patch({ appName: e.target.value })} disabled={!canEdit} />
              </Field>
              <Field label="Địa chỉ">
                <Input value={form.address} onChange={(e) => patch({ address: e.target.value })} disabled={!canEdit} />
              </Field>
              <Field label="Màu thương hiệu" hint="Áp dụng cho nút, liên kết và thanh điều hướng.">
                <div className="color-field">
                  <span className="color-swatch">
                    <input
                      type="color"
                      value={form.brandColor}
                      onChange={(e) => patch({ brandColor: e.target.value.toUpperCase() })}
                      disabled={!canEdit}
                      aria-label="Chọn màu thương hiệu"
                    />
                  </span>
                  <Input
                    value={form.brandColor}
                    onChange={(e) => patch({ brandColor: e.target.value.toUpperCase() })}
                    disabled={!canEdit}
                    className="mono"
                  />
                </div>
              </Field>
              <Field label="Logo URL" hint="Đường dẫn http(s) hoặc đường dẫn nội bộ.">
                <Input value={form.logoUrl} onChange={(e) => patch({ logoUrl: e.target.value })} disabled={!canEdit} placeholder="/mark.svg" />
              </Field>
            </div>
          </section>

          <section className="card setting-section">
            <div className="setting-section-head">
              <div className="setting-section-title"><Clock3 size={15} /> Lịch làm việc</div>
              <div className="setting-section-desc">Ngày làm việc mặc định cho các vị trí không cấu hình riêng.</div>
            </div>
            <Field label="Ngày làm việc trong tuần">
              <div className="workday-picker">
                {WEEKDAYS_SHORT.slice(1).map((label, i) => {
                  const day = i + 1;
                  const active = form.workdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`workday-chip ${active ? 'is-active' : ''}`}
                      onClick={() => canEdit && toggleDay(day)}
                      disabled={!canEdit}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="setting-row">
              <div className="setting-row-copy">
                <div className="setting-row-label">Cách tính đi muộn</div>
                <div className="setting-row-desc">Trừ toàn bộ phút muộn hoặc chỉ phần vượt ngưỡng cho phép.</div>
              </div>
              <Select
                value={form.lateMode}
                onChange={(e) => patch({ lateMode: e.target.value as Settings['lateMode'] })}
                disabled={!canEdit}
                style={{ width: 190 }}
              >
                <option value="full">Tính toàn bộ phút muộn</option>
                <option value="excess">Chỉ phần vượt ngưỡng</option>
              </Select>
            </div>
            <Switch
              checked={form.lateExplain}
              onChange={(v) => patch({ lateExplain: v })}
              label="Yêu cầu giải trình khi đi muộn"
              description="Nhân viên phải gửi giải trình cho các lần đi muộn chưa được duyệt."
              disabled={!canEdit}
            />
            <Switch
              checked={form.allowEarlyOT}
              onChange={(v) => patch({ allowEarlyOT: v })}
              label="Cho phép OT trước giờ vào ca"
              description="Tính tăng ca khi nhân viên vào sớm hơn giờ ca."
              disabled={!canEdit}
            />
            <Switch
              checked={form.autoOtFromRequest}
              onChange={(v) => patch({ autoOtFromRequest: v })}
              label="Tự động cộng OT đã duyệt"
              description="Đơn OT được duyệt sẽ tự động cộng vào bảng công."
              disabled={!canEdit}
            />
          </section>

          <section className="card setting-section">
            <div className="setting-section-head">
              <div className="setting-section-title"><Smartphone size={15} /> Chấm công & lương</div>
              <div className="setting-section-desc">Quy tắc ảnh, ngưỡng OT và kỳ chốt lương.</div>
            </div>
            <Switch
              checked={form.requirePhoto}
              onChange={(v) => patch({ requirePhoto: v })}
              label="Bắt buộc ảnh khi chấm công"
              description="Áp dụng cho nhân viên chưa được miễn ảnh theo vị trí."
              disabled={!canEdit}
            />
            <Switch
              checked={form.payrollEnabled}
              onChange={(v) => patch({ payrollEnabled: v })}
              label="Bật bảng lương"
              description="Cho phép tính và chốt lương trên hệ thống."
              disabled={!canEdit}
            />
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Ngưỡng OT tối thiểu (phút)" hint="Tăng ca ngắn hơn ngưỡng này không được tính.">
                <Input type="number" min={0} max={240} value={form.otMinMinutes} onChange={(e) => patch({ otMinMinutes: e.target.value })} disabled={!canEdit} />
              </Field>
              <Field label="Ngày chốt lương" hint="Ngày trong tháng dùng để nhắc chốt bảng lương.">
                <Input type="number" min={0} max={240} value={form.payCloseDay} onChange={(e) => patch({ payCloseDay: e.target.value })} disabled={!canEdit} />
              </Field>
            </div>
          </section>

          <section className="card setting-section">
            <div className="setting-section-head">
              <div className="setting-section-title"><Link2 size={15} /> Liên kết tham chiếu</div>
              <div className="setting-section-desc">Chỉ lưu đường dẫn để mở nhanh. Ứng dụng không tự động đồng bộ dữ liệu ra ngoài.</div>
            </div>
            <div className="form-grid">
              <Field label="Bảng công tham chiếu">
                <Input value={form.sheetUrl} onChange={(e) => patch({ sheetUrl: e.target.value })} disabled={!canEdit} placeholder="https://…" />
              </Field>
              <Field label="Thư mục lưu trữ">
                <Input value={form.driveUrl} onChange={(e) => patch({ driveUrl: e.target.value })} disabled={!canEdit} placeholder="https://…" />
              </Field>
            </div>
          </section>

          {canEdit ? (
            <div className="danger-zone">
              <h3><AlertTriangle size={15} /> Vùng nguy hiểm</h3>
              <p>Khôi phục toàn bộ dữ liệu demo về trạng thái ban đầu. Mọi thay đổi về nhân sự, chấm công, đơn từ và bảng lương sẽ bị xoá.</p>
              <Button variant="danger" icon={Database} style={{ marginTop: 10 }} onClick={() => { setResetOpen(true); setResetText(''); }}>
                Khôi phục dữ liệu demo
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rail">
          <div className="card">
            <div className="card-head is-bordered">
              <div>
                <div className="card-title"><Palette size={16} /> Xem trước thương hiệu</div>
                <div className="card-sub">Áp dụng ngay sau khi lưu.</div>
              </div>
            </div>
            <div className="card-body">
              <div className="brand-preview">
                <div className="brand-preview-bar" style={{ background: form.brandColor }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: 'rgba(255,255,255,0.22)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {(form.companyName || 'A').slice(0, 1)}
                  </span>
                  <span className="truncate">{form.appName || 'Chấm công'}</span>
                </div>
                <div className="brand-preview-body">
                  <div className="brand-preview-card">
                    <div className="tiny muted">{form.companyName || 'Tên công ty'}</div>
                    <div className="strong" style={{ marginTop: 2 }}>Chấm công vào ca</div>
                    <div className="row" style={{ marginTop: 8, gap: 6 }}>
                      <span
                        style={{
                          height: 24,
                          flex: 1,
                          borderRadius: 6,
                          background: form.brandColor,
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        <Check size={12} />
                      </span>
                      <span style={{ height: 24, width: 44, borderRadius: 6, border: '1px solid var(--line)' }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                <div className="row between tiny">
                  <span className="muted">Mã công ty</span>
                  <span className="mono strong">{form.companyCode || '—'}</span>
                </div>
                <div className="row between tiny">
                  <span className="muted">Ngày làm việc</span>
                  <span className="strong">{form.workdays.length} ngày/tuần</span>
                </div>
                <div className="row between tiny">
                  <span className="muted">Màu thương hiệu</span>
                  <span className="mono strong">{form.brandColor}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head is-bordered">
              <div className="card-title"><ShieldAlert size={16} /> Quyền truy cập</div>
            </div>
            <div className="card-body tiny muted" style={{ lineHeight: 1.6 }}>
              {canEdit
                ? 'Bạn là quản trị viên: có thể thay đổi toàn bộ cài đặt và khôi phục dữ liệu demo.'
                : 'Bạn là nhân sự: chỉ xem được cài đặt. Liên hệ quản trị viên để thay đổi thương hiệu hoặc quy tắc chấm công.'}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Khôi phục dữ liệu demo?"
        description="Toàn bộ dữ liệu hiện tại sẽ bị xoá và tạo lại từ dữ liệu mẫu. Không thể hoàn tác."
        size="sm"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)} disabled={resetBusy}>Huỷ</Button>
            <Button variant="danger" loading={resetBusy} disabled={resetText !== 'RESET'} onClick={reset}>
              Khôi phục
            </Button>
          </>
        }
      >
        <Field label="Nhập RESET để xác nhận" required>
          <Input
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            placeholder="RESET"
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}
