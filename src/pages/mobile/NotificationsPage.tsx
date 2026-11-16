import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, FileText, Wallet } from 'lucide-react';
import { Button, ErrorState, LoadingBlock } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync, useNow } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { timeAgo } from '../../lib/format';
import type { NotificationItem } from '../../lib/types';

const KIND_META: Record<NotificationItem['kind'], { tone: string; icon: typeof Bell }> = {
  payslip: { tone: 'green', icon: Wallet },
  request: { tone: 'blue', icon: FileText },
  task: { tone: 'amber', icon: CheckCheck },
  system: { tone: 'violet', icon: Bell },
};

export default function NotificationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [marking, setMarking] = useState(false);
  const { data, error, loading, reload, setData } = useAsync<{ notifications: NotificationItem[] }>(
    () => api.get('/api/me/notifications'),
    [],
  );

  if (loading) {
    return (
      <div className="m-page">
        <LoadingBlock rows={6} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="m-page">
        <ErrorState message={error ?? 'Không tải được thông báo.'} onRetry={() => reload()} />
      </div>
    );
  }

  const unread = data.notifications.filter((n) => !n.read).length;
  const visible = filter === 'unread' ? data.notifications.filter((n) => !n.read) : data.notifications;

  const markAll = async () => {
    if (!unread) return;
    setMarking(true);
    try {
      await api.post('/api/me/notifications/read', {});
      setData((prev) =>
        prev
          ? { notifications: prev.notifications.map((n) => ({ ...n, read: true })) }
          : prev,
      );
      toast.success('Đã đánh dấu tất cả là đã đọc.');
    } catch {
      toast.error('Không thể cập nhật trạng thái thông báo.');
    } finally {
      setMarking(false);
    }
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.read) {
      try {
        await api.post('/api/me/notifications/read', { id: item.id });
        setData((prev) =>
          prev
            ? {
                notifications: prev.notifications.map((n) =>
                  n.id === item.id ? { ...n, read: true } : n,
                ),
              }
            : prev,
        );
      } catch {
        /* vẫn cho phép mở nội dung */
      }
    }
    const target =
      item.kind === 'request'
        ? '/m/don'
        : item.kind === 'payslip'
          ? '/m/luong'
          : item.link || '/m/thong-bao';
    navigate(target);
  };

  return (
    <div className="m-page m-page-tight">
      <div className="m-between">
        <div>
          <div className="m-strong" style={{ fontSize: 13 }}>Cập nhật mới nhất</div>
          <div className="m-caption">{unread ? `${unread} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo'}</div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={CheckCheck}
          loading={marking}
          disabled={!unread}
          onClick={markAll}
        >
          Đọc tất cả
        </Button>
      </div>

      <div className="m-tabs-scroll">
        <button
          type="button"
          className={`m-filter ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Tất cả ({data.notifications.length})
        </button>
        <button
          type="button"
          className={`m-filter ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Chưa đọc ({unread})
        </button>
      </div>

      {visible.length ? (
        <div className="m-list">
          {visible.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <button
                type="button"
                className="m-row"
                key={item.id}
                onClick={() => void openNotification(item)}
              >
                <span className={`m-row-icon t-${meta.tone}`}>
                  <Icon size={16} />
                </span>
                <div className="m-row-body">
                  <div className="m-row-title">
                    {item.title}
                    {item.read ? null : <span className="m-unread-dot" />}
                  </div>
                  <div className="m-row-sub">{item.body}</div>
                </div>
                <span className="m-row-side">{timeAgo(item.at, now.getTime())}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="m-card">
          <div className="m-empty">
            <Bell size={22} />
            <div>{filter === 'unread' ? 'Không có thông báo chưa đọc.' : 'Bạn chưa có thông báo nào.'}</div>
          </div>
        </div>
      )}

      <div className="m-caption" style={{ padding: '0 4px' }}>
        Thông báo về đơn từ, phiếu lương và cập nhật từ công ty sẽ xuất hiện tại đây.
      </div>
    </div>
  );
}
