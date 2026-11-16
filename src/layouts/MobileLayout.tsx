import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, Fingerprint, Home, Table2, UserRound, Inbox } from 'lucide-react';
import { Avatar } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/session';
import type { NotificationItem } from '../lib/types';

export default function MobileLayout() {
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  const meta = useMemo(() => {
    const path = location.pathname;
    if (path === '/m/') return { title: me?.company.appName ?? 'Chấm công', kicker: me?.company.name ?? '', back: null };
    if (path === '/m/bang-cong') return { title: 'Bảng công', kicker: 'Chấm công của tôi', back: null };
    if (path === '/m/lich') return { title: 'Lịch làm việc', kicker: 'Ca làm của tôi', back: null };
    if (path === '/m/don') return { title: 'Đơn từ', kicker: 'Nghỉ phép · OT · Giải trình', back: null };
    if (path === '/m/luong') return { title: 'Phiếu lương', kicker: 'Thu nhập của tôi', back: null };
    if (path.startsWith('/m/luong/')) return { title: 'Chi tiết phiếu lương', kicker: 'Thu nhập của tôi', back: '/m/luong' };
    if (path === '/m/thong-bao') return { title: 'Thông báo', kicker: 'Cập nhật mới nhất', back: '/m/' };
    if (path === '/m/toi') return { title: 'Tài khoản', kicker: 'Hồ sơ cá nhân', back: null };
    return { title: 'Chấm công', kicker: '', back: '/m/' };
  }, [location.pathname, me?.company]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.get<{ notifications: NotificationItem[] }>('/api/me/notifications');
        if (!cancelled) setUnread(data.notifications.filter((n) => !n.read).length);
      } catch {
        /* ignore badge failures */
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [location.pathname]);

  if (!me) return null;

  return (
    <div className="m-app">
      <div className="m-shell">
        <header className="m-header">
          {meta.back ? (
            <Link to={meta.back} className="m-header-back" aria-label="Quay lại">
              <ChevronLeft size={18} />
            </Link>
          ) : null}
          <div className="m-header-brand">
            <div className="m-header-kicker">{meta.kicker}</div>
            <div className="m-header-title">{meta.title}</div>
          </div>
          <div className="m-header-actions">
            <Link to="/m/thong-bao" className="m-icon-btn" aria-label="Thông báo">
              <Bell size={18} />
              {unread > 0 ? <span className="m-icon-dot" /> : null}
            </Link>
            <Link to="/m/toi" aria-label="Tài khoản" style={{ display: 'grid' }}>
              <Avatar name={me.employee.name} size={38} toneKey={me.employee.id} className="m-header-avatar" />
            </Link>
          </div>
        </header>

        <main className="m-main">
          <Outlet />
        </main>

        <nav className="m-nav" aria-label="Điều hướng ứng dụng">
          <NavLink to="/m/" end className={({ isActive }) => `m-nav-item ${isActive ? 'active' : ''}`}>
            <Home size={19} />
            <span>Tổng quan</span>
          </NavLink>
          <NavLink to="/m/bang-cong" className={({ isActive }) => `m-nav-item ${isActive ? 'active' : ''}`}>
            <Table2 size={19} />
            <span>Bảng công</span>
          </NavLink>
          <div className="m-nav-fab-wrap">
            <button
              type="button"
              className="m-nav-fab"
              aria-label="Chấm công"
              onClick={() => navigate('/m/?punch=1')}
            >
              <Fingerprint size={21} />
              <span>Chấm</span>
            </button>
          </div>
          <NavLink to="/m/don" className={({ isActive }) => `m-nav-item ${isActive ? 'active' : ''}`}>
            <Inbox size={19} />
            <span>Đơn từ</span>
          </NavLink>
          <NavLink to="/m/toi" className={({ isActive }) => `m-nav-item ${isActive ? 'active' : ''}`}>
            <UserRound size={19} />
            <span>Tài khoản</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
