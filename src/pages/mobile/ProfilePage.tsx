import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  Smartphone,
  Table2,
  UserRound,
  Wallet,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  LoadingBlock,
} from '../../components/ui';
import { ConfirmModal } from '../../components/Confirm';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { useAuth } from '../../lib/session';
import {
  ROLE_LABEL,
  ROLE_TONE,
  dateShort,
  fmtNumber,
  formatMinutes,
} from '../../lib/format';
import type { EmployeeHomeData } from '../../lib/types';

export default function ProfilePage() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useAsync<EmployeeHomeData>(
    () => api.get('/api/me/home'),
    [],
  );

  if (loading) {
    return (
      <div className="m-page">
        <LoadingBlock rows={6} />
      </div>
    );
  }
  if (error || !data || !me) {
    return (
      <div className="m-page">
        <ErrorState message={error ?? 'Không tải được hồ sơ.'} onRetry={() => reload()} />
      </div>
    );
  }

  const { employee, position, company, month, leaveBalance, device, locations } = data;
  const roleTone = ROLE_TONE[employee.role] ?? 'slate';

  const doLogout = async () => {
    setBusy(true);
    try {
      await logout();
      navigate('/m/login', { replace: true });
    } finally {
      setBusy(false);
      setConfirmLogout(false);
    }
  };

  return (
    <div className="m-page m-page-tight">
      <section className="m-profile-head">
        <Avatar name={employee.name} size={54} toneKey={employee.id} className="m-profile-avatar" />
        <div className="m-profile-info">
          <h2>{employee.name}</h2>
          <p>{position.name} · {employee.code}</p>
          <div className="m-profile-tags">
            <Badge tone={roleTone}>{ROLE_LABEL[employee.role]}</Badge>
            <Badge tone="outline">{employee.contract}</Badge>
            {employee.status === 'active' ? <Badge tone="success" dot>Đang làm việc</Badge> : <Badge tone="slate">Đã nghỉ</Badge>}
          </div>
        </div>
      </section>

      <div className="m-profile-stats">
        <div className="m-profile-stat">
          <b>{fmtNumber(month.cong)}</b>
          <span>Công tháng này</span>
        </div>
        <div className="m-profile-stat">
          <b>{leaveBalance}</b>
          <span>Ngày phép còn</span>
        </div>
        <div className="m-profile-stat">
          <b>{formatMinutes(month.otMinutes)}</b>
          <span>Tăng ca</span>
        </div>
      </div>

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">Thông tin cá nhân</div>
        </div>
        <div className="m-list">
          <div className="m-row">
            <span className="m-row-icon t-blue"><Building2 size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Công ty</div>
              <div className="m-row-sub">{company.name}</div>
            </div>
          </div>
          <div className="m-row">
            <span className="m-row-icon t-green"><UserRound size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Vị trí công việc</div>
              <div className="m-row-sub">{position.name}</div>
            </div>
          </div>
          <div className="m-row">
            <span className="m-row-icon t-sky"><Mail size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Email</div>
              <div className="m-row-sub">{employee.email}</div>
            </div>
          </div>
          <div className="m-row">
            <span className="m-row-icon t-amber"><CalendarDays size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Ngày vào làm</div>
              <div className="m-row-sub">{dateShort(employee.startDate)}</div>
            </div>
          </div>
          <div className="m-row">
            <span className="m-row-icon t-violet"><MapPin size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Địa điểm chấm công</div>
              <div className="m-row-sub">
                {position.anywhere
                  ? 'Mọi nơi (vị trí không giới hạn địa điểm)'
                  : locations.length
                    ? locations.map((l) => l.name).join(', ')
                    : 'Chưa cấu hình địa điểm'}
              </div>
            </div>
          </div>
          <div className="m-row">
            <span className={`m-row-icon ${device ? 't-green' : 't-red'}`}><Smartphone size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Thiết bị chấm công</div>
              <div className="m-row-sub">{device ? device.label || device.id : 'Chưa liên kết thiết bị'}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">Tiện ích</div>
        </div>
        <div className="m-list">
          <Link to="/m/bang-cong" className="m-row">
            <span className="m-row-icon t-green"><Table2 size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Bảng công của tôi</div>
              <div className="m-row-sub">Xem công, đi muộn và tăng ca</div>
            </div>
            <ChevronRight size={16} className="m-row-chevron" />
          </Link>
          <Link to="/m/lich" className="m-row">
            <span className="m-row-icon t-amber"><CalendarDays size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Lịch làm việc</div>
              <div className="m-row-sub">Ca làm theo tuần</div>
            </div>
            <ChevronRight size={16} className="m-row-chevron" />
          </Link>
          <Link to="/m/luong" className="m-row">
            <span className="m-row-icon t-violet"><Wallet size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Phiếu lương</div>
              <div className="m-row-sub">Thu nhập đã công bố</div>
            </div>
            <ChevronRight size={16} className="m-row-chevron" />
          </Link>
          <Link to="/m/don" className="m-row">
            <span className="m-row-icon t-blue"><FileText size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Đơn từ</div>
              <div className="m-row-sub">Nghỉ phép, làm thêm, giải trình</div>
            </div>
            <ChevronRight size={16} className="m-row-chevron" />
          </Link>
          <Link to="/m/thong-bao" className="m-row">
            <span className="m-row-icon t-violet"><Bell size={16} /></span>
            <div className="m-row-body">
              <div className="m-row-title">Thông báo</div>
              <div className="m-row-sub">Cập nhật từ công ty</div>
            </div>
            {data.unread ? <span className="m-unread-dot" /> : <ChevronRight size={16} className="m-row-chevron" />}
          </Link>
        </div>
      </section>

      <div className="m-banner info">
        <ShieldCheck size={15} />
        <span>
          Chấm công bằng vị trí và thiết bị đã liên kết. Nếu đổi thiết bị, liên hệ quản trị viên để được hỗ trợ.
        </span>
      </div>

      <Button
        variant="danger"
        block
        icon={LogOut}
        onClick={() => setConfirmLogout(true)}
      >
        Đăng xuất
      </Button>

      <div className="m-caption" style={{ textAlign: 'center', padding: '4px 0 8px' }}>
        {company.appName} · {company.name}
        <br />
        {company.address}
      </div>

      <ConfirmModal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => void doLogout()}
        title="Đăng xuất khỏi ứng dụng?"
        description="Bạn sẽ cần nhập lại mã công ty, email và mã PIN để đăng nhập."
        confirmLabel="Đăng xuất"
        busy={busy}
      />
    </div>
  );
}
