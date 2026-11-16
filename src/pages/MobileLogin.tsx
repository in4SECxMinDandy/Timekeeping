import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../lib/session';
import { avatarTone, initials } from '../lib/format';

const DEMO = [
  { name: 'Nguyễn Minh Đức', role: 'Nhân viên · Kinh doanh', email: 'duc@anphat.vn', pin: '1111' },
  { name: 'Vũ Ngọc Lan', role: 'Nhân viên · Kế toán', email: 'lan@anphat.vn', pin: '9999' },
  { name: 'Ngô Khánh Vy', role: 'Thực tập sinh', email: 'vy@anphat.vn', pin: '9999' },
];

export default function MobileLoginPage() {
  const { status, me, login } = useAuth();
  const navigate = useNavigate();
  const [companyCode, setCompanyCode] = useState('ANPHAT');
  const [email, setEmail] = useState('duc@anphat.vn');
  const [pin, setPin] = useState('1111');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authed' && me) navigate('/m/', { replace: true });
  }, [status, me, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await login({ companyCode, email, pin, surface: 'employee' });
      navigate(data.redirect || '/m/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="m-auth">
      <div className="m-auth-shell">
        <div className="m-auth-hero">
          <div className="m-auth-logo">
            <img src="/mark.svg" alt="" width={26} height={26} style={{ borderRadius: 7 }} />
            Chấm công · E-HRM
          </div>
          <h1>Chào ngày mới,<br />bắt đầu ca làm thôi.</h1>
          <p>Chấm công bằng GPS, xem bảng công và gửi đơn ngay trên điện thoại.</p>
        </div>

        <div className="m-auth-body">
          <form className="auth-form" onSubmit={submit}>
            {error ? <div className="auth-error" role="alert">{error}</div> : null}
            <Field label="Mã công ty" htmlFor="m-company">
              <Input
                id="m-company"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                autoComplete="organization"
                placeholder="ANPHAT"
                required
              />
            </Field>
            <Field label="Email" htmlFor="m-email">
              <Input
                id="m-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="ban@congty.vn"
                required
              />
            </Field>
            <Field label="Mã PIN" htmlFor="m-pin">
              <Input
                id="m-pin"
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
              Đăng nhập
            </Button>
            <div className="auth-device">
              <ShieldCheck size={14} />
              Tài khoản được khoá theo thiết bị để bảo vệ dữ liệu chấm công.
            </div>
          </form>

          <div className="auth-demo m-auth-demo">
            <div className="auth-demo-head">
              <span className="auth-demo-title">Tài khoản demo</span>
              <span className="auth-hint" style={{ margin: 0 }}>ANPHAT</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  <span style={{ flex: 1 }}>
                    <strong>{d.name}</strong>
                    <small>{d.role}</small>
                  </span>
                  <small style={{ fontVariantNumeric: 'tabular-nums' }}>PIN {d.pin}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="m-login-alt">
            <span className="m-inline">
              <Smartphone size={13} /> Ứng dụng nhân viên
            </span>
            <Link to="/login">
              <span className="m-inline"><Monitor size={13} /> Quản trị</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
