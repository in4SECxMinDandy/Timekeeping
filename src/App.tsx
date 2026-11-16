import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, canUseAdmin } from './lib/session';
import LoginPage from './pages/Login';
import MobileLoginPage from './pages/MobileLogin';
import AdminLayout from './layouts/AdminLayout';
import MobileLayout from './layouts/MobileLayout';
import WorkbenchPage from './pages/admin/WorkbenchPage';
import DispatchPage from './pages/admin/DispatchPage';
import TimesheetPage from './pages/admin/TimesheetPage';
import SchedulePage from './pages/admin/SchedulePage';
import PayrollPage from './pages/admin/PayrollPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import PositionsPage from './pages/admin/PositionsPage';
import LocationsPage from './pages/admin/LocationsPage';
import SettingsPage from './pages/admin/SettingsPage';
import HomePage from './pages/mobile/HomePage';
import MobileTimesheetPage from './pages/mobile/TimesheetPage';
import MobileSchedulePage from './pages/mobile/SchedulePage';
import RequestsPage from './pages/mobile/RequestsPage';
import PayslipsPage from './pages/mobile/PayslipsPage';
import PayslipDetailPage from './pages/mobile/PayslipDetailPage';
import NotificationsPage from './pages/mobile/NotificationsPage';
import ProfilePage from './pages/mobile/ProfilePage';

function Splash() {
  return (
    <div className="boot">
      <img src="/mark.svg" alt="" width={44} height={44} />
      <div className="boot-text">Đang kết nối dữ liệu chấm công…</div>
      <div className="boot-bar">
        <span />
      </div>
    </div>
  );
}

function RootRedirect() {
  const { status, me } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'anon') return <Navigate to="/login" replace />;
  return <Navigate to={canUseAdmin(me?.employee.role) ? '/app/' : '/m/'} replace />;
}

function AdminGate({ children }: { children: ReactNode }) {
  const { status, me } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'anon' || !me) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!canUseAdmin(me.employee.role)) return <Navigate to="/m/" replace />;
  return <>{children}</>;
}

function MobileGate({ children }: { children: ReactNode }) {
  const { status, me } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'anon' || !me) {
    return <Navigate to="/m/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/m/login" element={<MobileLoginPage />} />
      <Route
        path="/app"
        element={
          <AdminGate>
            <AdminLayout />
          </AdminGate>
        }
      >
        <Route index element={<WorkbenchPage />} />
        <Route path="dieu-phoi" element={<DispatchPage />} />
        <Route path="bang-cong" element={<TimesheetPage />} />
        <Route path="xep-ca" element={<SchedulePage />} />
        <Route path="luong" element={<PayrollPage />} />
        <Route path="nhan-su" element={<EmployeesPage />} />
        <Route path="vi-tri" element={<PositionsPage />} />
        <Route path="dia-diem" element={<LocationsPage />} />
        <Route path="cai-dat" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/app/" replace />} />
      </Route>
      <Route
        path="/m"
        element={
          <MobileGate>
            <MobileLayout />
          </MobileGate>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="bang-cong" element={<MobileTimesheetPage />} />
        <Route path="lich" element={<MobileSchedulePage />} />
        <Route path="don" element={<RequestsPage />} />
        <Route path="luong" element={<PayslipsPage />} />
        <Route path="luong/:period" element={<PayslipDetailPage />} />
        <Route path="thong-bao" element={<NotificationsPage />} />
        <Route path="toi" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/m/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
