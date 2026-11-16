import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarRange,
  Grid2X2,
  LogOut,
  MapPin,
  Radar,
  Search,
  Settings,
  Smartphone,
  Table2,
  Users,
  Wallet,
  Briefcase,
} from 'lucide-react';
import { useAuth, canUseAdmin } from '../lib/session';

interface PalItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ComponentType<{ size?: number }>;
  path?: string;
  action?: () => void;
  roles?: string[];
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const role = me?.employee.role ?? 'employee';

  const items = useMemo<PalItem[]>(() => {
    const base: PalItem[] = [
      { id: 'wb', label: 'Hộp việc hôm nay', group: 'Vận hành', icon: Grid2X2, path: '/app/' },
      { id: 'dp', label: 'Điều phối chấm công', group: 'Vận hành', icon: Radar, path: '/app/dieu-phoi' },
      { id: 'ts', label: 'Bảng công tháng', group: 'Vận hành', icon: Table2, path: '/app/bang-cong' },
      { id: 'sc', label: 'Xếp ca làm việc', group: 'Vận hành', icon: CalendarRange, path: '/app/xep-ca' },
      { id: 'pay', label: 'Bảng lương', group: 'Quản trị', icon: Wallet, path: '/app/luong', roles: ['admin', 'hr'] },
      { id: 'emp', label: 'Danh sách nhân viên', group: 'Quản trị', icon: Users, path: '/app/nhan-su', roles: ['admin', 'hr'] },
      { id: 'pos', label: 'Vị trí & ca làm', group: 'Quản trị', icon: Briefcase, path: '/app/vi-tri', roles: ['admin', 'hr'] },
      { id: 'loc', label: 'Địa điểm chấm công', group: 'Quản trị', icon: MapPin, path: '/app/dia-diem', roles: ['admin', 'hr'] },
      { id: 'set', label: 'Cài đặt công ty', group: 'Hệ thống', icon: Settings, path: '/app/cai-dat', roles: ['admin', 'hr'] },
      {
        id: 'mobile',
        label: 'Mở ứng dụng nhân viên',
        hint: 'Di động',
        group: 'Hành động',
        icon: Smartphone,
        action: () => navigate('/m/'),
      },
      {
        id: 'logout',
        label: 'Đăng xuất khỏi thiết bị',
        group: 'Hành động',
        icon: LogOut,
        action: () => {
          void logout();
          navigate('/login', { replace: true });
        },
      },
    ];
    return base.filter((i) => !i.roles || i.roles.includes(role));
  }, [role, navigate, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.group} ${i.hint ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;
  if (!canUseAdmin(role)) return null;

  function run(item: PalItem) {
    onClose();
    if (item.path) navigate(item.path);
    item.action?.();
  }

  return createPortal(
    <div
      className="palette-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Tìm nhanh">
        <div className="palette-input-wrap">
          <Search size={17} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Tìm trang, nhân viên, thao tác…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((v) => Math.min(filtered.length - 1, v + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((v) => Math.max(0, v - 1));
              }
              if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault();
                run(filtered[active]);
              }
            }}
            aria-controls="palette-results"
          />
          <span className="palette-esc">ESC</span>
        </div>
        <div className="palette-list" id="palette-results">
          {filtered.length ? (
            filtered.map((item, idx) => {
              const showGroup = idx === 0 || filtered[idx - 1].group !== item.group;
              return (
                <div key={item.id}>
                  {showGroup ? <div className="palette-group">{item.group}</div> : null}
                  <button
                    type="button"
                    className={`palette-item ${idx === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => run(item)}
                  >
                    <item.icon size={16} />
                    {item.label}
                    {item.hint ? <small>{item.hint}</small> : <ArrowRight size={13} style={{ marginLeft: 'auto', opacity: 0.35 }} />}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="empty" style={{ padding: '28px 16px' }}>
              Không tìm thấy mục phù hợp với “{query}”.
            </div>
          )}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> di chuyển</span>
          <span><kbd>↵</kbd> mở</span>
          <span><kbd>ESC</kbd> đóng</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
