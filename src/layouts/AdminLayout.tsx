import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  LogOut,
  MapPin,
  Menu,
  Radar,
  Search,
  Settings,
  Smartphone,
  Table2,
  Users,
  Wallet,
} from 'lucide-react';
import { Avatar, Dropdown, MenuItem } from '../components/ui';
import CommandPalette from '../components/CommandPalette';
import { useAuth, canUseAdmin } from '../lib/session';
import { ROLE_LABEL, dateLong, todayIct } from '../lib/format';

const NAV = [
  {
    label: 'Vận hành',
    items: [
      { to: '/app/', end: true, label: 'Hộp việc', icon: Grid2X2 },
      { to: '/app/dieu-phoi', label: 'Điều phối', icon: Radar },
      { to: '/app/bang-cong', label: 'Bảng công', icon: Table2 },
      { to: '/app/xep-ca', label: 'Xếp ca', icon: CalendarRange },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { to: '/app/luong', label: 'Bảng lương', icon: Wallet, roles: ['admin', 'hr'] },
      { to: '/app/nhan-su', label: 'Nhân sự', icon: Users, roles: ['admin', 'hr'] },
      { to: '/app/vi-tri', label: 'Vị trí & ca', icon: Briefcase, roles: ['admin', 'hr'] },
      { to: '/app/dia-diem', label: 'Địa điểm', icon: MapPin, roles: ['admin', 'hr'] },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { to: '/app/cai-dat', label: 'Cài đặt', icon: Settings, roles: ['admin', 'hr'] },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/app/': 'Hộp việc',
  '/app/dieu-phoi': 'Điều phối chấm công',
  '/app/bang-cong': 'Bảng công',
  '/app/xep-ca': 'Xếp ca làm việc',
  '/app/luong': 'Bảng lương',
  '/app/nhan-su': 'Nhân sự',
  '/app/vi-tri': 'Vị trí & ca làm',
  '/app/dia-diem': 'Địa điểm chấm công',
  '/app/cai-dat': 'Cài đặt công ty',
};

export default function AdminLayout() {
  const { me, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const role = me?.employee.role ?? 'employee';
  const company = me?.company;
  const setupRole = role === 'admin' || role === 'hr';

  const title = TITLES[location.pathname] ?? 'Quản trị';
  const today = todayIct();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${title} · ${company?.appName ?? 'Chấm công'}`;
  }, [title, company?.appName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const sections = useMemo(
    () =>
      NAV.map((s) => ({
        ...s,
        items: s.items.filter((i) => !('roles' in i) || (i.roles as string[]).includes(role)),
      })).filter((s) => s.items.length),
    [role],
  );

  if (!me) return null;

  return (
    <div className="admin-shell">
      {navOpen ? <div className="side-scrim" onClick={() => setNavOpen(false)} /> : null}
      <aside className={`sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="side-brand">
          <img className="side-mark" src="/mark.svg" alt="" />
          <div className="side-word">
            {company?.appName ?? 'Chấm công'}
            <small>Bảng điều khiển</small>
          </div>
        </div>

        {setupRole ? (
          <Link to="/app/cai-dat" className="tenant-chip" aria-label="Thông tin công ty">
            <span className="tenant-logo">{company?.name.slice(0, 1) ?? 'A'}</span>
            <span className="tenant-copy">
              <span className="tenant-name">{company?.name ?? 'Công ty'}</span>
              <span className="tenant-code">Mã {company?.code ?? '—'}</span>
            </span>
            <ChevronRight size={14} style={{ color: 'var(--muted-2)' }} />
          </Link>
        ) : (
          <div className="tenant-chip">
            <span className="tenant-logo">{company?.name.slice(0, 1) ?? 'A'}</span>
            <span className="tenant-copy">
              <span className="tenant-name">{company?.name ?? 'Công ty'}</span>
              <span className="tenant-code">Mã {company?.code ?? '—'}</span>
            </span>
          </div>
        )}

        <nav className="side-scroll" aria-label="Điều hướng quản trị">
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="nav-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? Boolean(item.end) : false}
                  className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <Dropdown
            align="left"
            width={180}
            trigger={({ toggle }) => (
              <button type="button" className="user-mini" onClick={toggle} aria-haspopup="menu">
                <Avatar name={me.employee.name} size={30} toneKey={me.employee.id} />
                <span className="user-mini-copy">
                  <span className="user-mini-name">{me.employee.name}</span>
                  <span className="user-mini-role">{ROLE_LABEL[role]} · {me.employee.code}</span>
                </span>
                <ChevronDown size={14} style={{ color: 'var(--muted-2)' }} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={Smartphone} onClick={() => { close(); navigate('/m/'); }}>
                  Ứng dụng nhân viên
                </MenuItem>
                {setupRole ? (
                  <MenuItem icon={Settings} onClick={() => { close(); navigate('/app/cai-dat'); }}>
                    Cài đặt công ty
                  </MenuItem>
                ) : null}
                <div className="dropdown-sep" />
                <MenuItem
                  icon={LogOut}
                  danger
                  onClick={() => {
                    close();
                    void logout().then(() => navigate('/login', { replace: true }));
                  }}
                >
                  Đăng xuất
                </MenuItem>
              </>
            )}
          </Dropdown>
          <div className="side-version">
            <span>Phiên bản demo</span>
            <span>v0.1</span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn topbar-menu"
            aria-label="Mở menu"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="breadcrumb">
            <span>{company?.name ?? 'Công ty'}</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>

          <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)}>
            <Search size={14} />
            <span>Tìm nhanh…</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="topbar-right">
            <div className="topbar-date">
              <CalendarDays size={14} />
              {dateLong(today)}
            </div>
            <Link to="/m/" className="icon-btn" title="Mở ứng dụng nhân viên" aria-label="Ứng dụng nhân viên">
              <Smartphone size={16} />
            </Link>
            <Dropdown
              width={210}
              trigger={({ toggle }) => (
                <button type="button" className="topbar-user" onClick={toggle}>
                  <Avatar name={me.employee.name} size={28} toneKey={me.employee.id} />
                  <ChevronDown size={13} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <div style={{ padding: '8px 10px 6px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{me.employee.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {ROLE_LABEL[role]} · {me.employee.email}
                    </div>
                  </div>
                  <div className="dropdown-sep" />
                  <MenuItem icon={Smartphone} onClick={() => { close(); navigate('/m/'); }}>
                    Ứng dụng nhân viên
                  </MenuItem>
                  <MenuItem
                    icon={LogOut}
                    danger
                    onClick={() => {
                      close();
                      void logout().then(() => navigate('/login', { replace: true }));
                    }}
                  >
                    Đăng xuất
                  </MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="page">
          {canUseAdmin(role) ? <Outlet /> : null}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
