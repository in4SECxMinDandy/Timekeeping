import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { useAuth, canUseAdmin } from '../lib/session';
import { avatarTone, initials } from '../lib/format';

const DEMO = [
  { name: 'Lê Phương Thảo', role: 'Quản trị viên', email: 'thao@anphat.vn', pin: '1234' },
  { name: 'Trần Thị Mai', role: 'Nhân sự', email: 'mai@anphat.vn', pin: '2345' },
  { name: 'Phạm Quang Hưng', role: 'Quản lý', email: 'hung@anphat.vn', pin: '2222' },
  { name: 'Nguyễn Minh Đức', role: 'Nhân viên', email: 'duc@anphat.vn', pin: '1111' },
];

export default function LoginPage() {
  const { status, me, login } = useAuth();
  const navigate = useNavigate();
  const [companyCode, setCompanyCode] = useState('ANPHAT');
  const [email, setEmail] = useState('thao@anphat.vn');
  const [pin, setPin] = useState('1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authed' && me && canUseAdmin(me.employee.role)) navigate('/app/', { replace: true });
  }, [status, me, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await login({ companyCode, email, pin, surface: 'admin' });
      navigate(data.redirect || '/app/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="auth-brand-top">
          <div className="auth-brand-mark">
            <img src="/mark.svg" alt="" width={26} height={26} />
          </div>
          <div className="auth-brand-name">
            Chấm công
            <small>E-HRM CHO DOANH NGHIỆP VIỆT</small>
          </div>
        </div>

        <div className="auth-brand-main">
          <div className="auth-kicker">
            <Sparkles size={13} /> Vận hành nhân sự tập trung
          </div>
          <h1 className="auth-headline">Chấm công gọn gàng, bảng lương minh bạch.</h1>
          <p className="auth-sub">
            Quản lý ca làm, duyệt đơn và tính lương trên một màn hình. Dữ liệu chấm công
            GPS và ảnh xác thực được ghi nhận ngay khi nhân viên điểm danh.
          </p>
          <div className="auth-points">
            <div className="auth-point">
              <span className="auth-point-icon"><MapPin size={14} /></span>
              <div>
                Chấm công theo vị trí
                <small>Kiểm tra bán kính địa điểm, cảnh báo chấm ngoài vùng</small>
              </div>
            </div>
            <div className="auth-point">
              <span className="auth-point-icon"><ShieldCheck size={14} /></span>
              <div>
                Duyệt đơn và công tự động
                <small>Đơn nghỉ, OT, quên chấm — cập nhật thẳng vào bảng công</small>
              </div>
            </div>
            <div className="auth-point">
              <span className="auth-point-icon"><CheckCircle2 size={14} /></span>
              <div>
                Lương tính sẵn theo ca
                <small>OT theo hệ số, phụ cấp, BHXH và chốt kỳ lương một chạm</small>
              </div>
            </div>
          </div>
          <div className="auth-mock">
            <div className="auth-mock-card">
              <div className="auth-mock-label">Ca hôm nay</div>
              <div className="auth-mock-value">08:29 <small>đúng giờ</small></div>
            </div>
            <div className="auth-mock-card">
              <div className="auth-mock-label">Công tháng này</div>
              <div className="auth-mock-value">22<small>/ 26 công</small></div>
            </div>
          </div>
        </div>

        <div className="auth-foot">Bản demo nội bộ · Dữ liệu lưu trên máy chủ cục bộ</div>
      </section>

      <section className="auth-form-side">
        <div className="auth-card">
          <h1>Đăng nhập quản trị</h1>
          <p>Dành cho quản trị viên, nhân sự và quản lý. Nhân viên dùng ứng dụng di động.</p>

          <form className="auth-form" onSubmit={submit}>
            {error ? <div className="auth-error" role="alert">{error}</div> : null}
            <Field label="Mã công ty" htmlFor="login-company">
              <Input
                id="login-company"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                autoComplete="organization"
                placeholder="ANPHAT"
                required
              />
            </Field>
            <Field label="Email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="ban@congty.vn"
                required
              />
            </Field>
            <Field label="Mã PIN" htmlFor="login-pin" hint="4–8 chữ số. PIN được băm bằng scrypt trên máy chủ.">
              <Input
                id="login-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                autoComplete="current-password"
                placeholder="••••"
                required
              />
            </Field>
            <Button type="submit" size="lg" loading={busy} icon={ArrowRight}>
              Vào bảng điều khiển
            </Button>
            <div className="auth-device">
              <Fingerprint size={14} />
              Thiết bị này được gắn với tài khoản sau lần đăng nhập đầu tiên.
            </div>
          </form>

          <div className="auth-demo">
            <div className="auth-demo-head">
              <span className="auth-demo-title">Tài khoản demo</span>
              <span className="auth-hint" style={{ margin: 0 }}>Mã công ty ANPHAT</span>
            </div>
            <div className="auth-demo-grid">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  className="demo-chip"
                  onClick={() => {
                    setEmail(d.email);
                    setPin(d.pin);
                    setCompanyCode('ANPHAT');
                    setError(null);
                  }}
                >
                  <span className={`avatar avatar-${avatarTone(d.email)}`} style={{ width: 26, height: 26, fontSize: 9 }}>
                    {initials(d.name)}
                  </span>
                  <span>
                    <strong>{d.name}</strong>
                    <small>{d.role} · PIN {d.pin}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="auth-hint" style={{ marginTop: 18 }}>
            <Smartphone size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Bạn là nhân viên? <Link to="/m/login">Mở ứng dụng chấm công di động</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
