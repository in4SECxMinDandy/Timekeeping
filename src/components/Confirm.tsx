import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button, Modal } from './ui';

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  tone = 'danger',
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary' | 'success';
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'primary' ? 'primary' : tone === 'success' ? 'success' : 'danger'}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function NoAccess({ title = 'Bạn không có quyền truy cập' }: { title?: string }) {
  return (
    <div className="empty" style={{ padding: '80px 20px' }}>
      <span className="empty-icon">
        <ShieldAlert size={22} />
      </span>
      <div className="empty-title">{title}</div>
      <p className="empty-desc">Mục này chỉ dành cho quản trị viên và nhân sự. Liên hệ quản trị viên nếu bạn cần quyền truy cập.</p>
    </div>
  );
}
