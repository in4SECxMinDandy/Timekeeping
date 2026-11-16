import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  Grid2X2,
  Inbox,
  Info,
  ListChecks,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Timer,
  UserX,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Progress,
  Select,
  StatCard,
  Textarea,
  useSearchFilter,
} from '../../components/ui';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/session';
import { dateShort, timeAgo } from '../../lib/format';
import type { AdminTask, TaskKind, WorkbenchData } from '../../lib/types';

const KIND_META: Record<TaskKind, { label: string; icon: LucideIcon; tone: 'violet' | 'danger' | 'warn' | 'sky' | 'brand' | 'slate' }> = {
  ot: { label: 'Làm thêm', icon: Timer, tone: 'violet' },
  missing: { label: 'Thiếu chấm công', icon: AlertTriangle, tone: 'danger' },
  absence: { label: 'Vắng mặt', icon: UserX, tone: 'warn' },
  outside: { label: 'Ngoài vùng', icon: MapPin, tone: 'sky' },
  wrong_shift: { label: 'Sai ca', icon: CalendarClock, tone: 'warn' },
  leave: { label: 'Đơn từ', icon: FileText, tone: 'brand' },
  other: { label: 'Khác', icon: Info, tone: 'slate' },
};

const FILTERS: { value: 'all' | TaskKind; label: string; countKey?: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'ot', label: 'Làm thêm', countKey: 'ot' },
  { value: 'missing', label: 'Thiếu chấm công', countKey: 'missing' },
  { value: 'absence', label: 'Vắng mặt', countKey: 'absence' },
  { value: 'outside', label: 'Ngoài vùng', countKey: 'outside' },
  { value: 'wrong_shift', label: 'Sai ca', countKey: 'wrong_shift' },
  { value: 'leave', label: 'Đơn từ', countKey: 'leave' },
  { value: 'other', label: 'Khác', countKey: 'other' },
];

function isActionable(task: AdminTask): boolean {
  return (
    !!task.requestId ||
    task.kind === 'ot' ||
    task.kind === 'missing' ||
    task.kind === 'absence' ||
    task.kind === 'outside' ||
    task.kind === 'wrong_shift'
  );
}

function bulkItem(task: AdminTask): Record<string, unknown> | null {
  if (task.requestId) return { requestId: task.requestId };
  if (task.kind === 'ot') {
    return {
      employeeId: task.employeeId,
      date: task.date,
      kind: 'ot',
      action: 'approve',
      minutes: task.minutes ?? task.day.otMinutes,
    };
  }
  if (task.kind === 'missing') {
    return { employeeId: task.employeeId, date: task.date, kind: 'missing', cong: 1 };
  }
  if (task.kind === 'absence') {
    return { employeeId: task.employeeId, date: task.date, kind: 'absence', action: 'count' };
  }
  if (task.kind === 'outside') {
    return { employeeId: task.employeeId, date: task.date, kind: 'outside', action: 'accept' };
  }
  if (task.kind === 'wrong_shift') {
    return { employeeId: task.employeeId, date: task.date, kind: 'wrong_shift', action: 'accept' };
  }
  return null;
}

export default function WorkbenchPage() {
  const { me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, error, loading, reload, setData } = useAsync<WorkbenchData>(() =>
    api.get('/api/admin/workbench'),
  );
  const [filter, setFilter] = useState<'all' | TaskKind>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [otAdjust, setOtAdjust] = useState<{ task: AdminTask; minutes: string } | null>(null);
  const [shiftChange, setShiftChange] = useState<{ task: AdminTask; shiftId: string } | null>(null);
  const [requestDecision, setRequestDecision] = useState<{
    task: AdminTask;
    action: 'approve' | 'reject';
    note: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const byKind = filter === 'all' ? tasks : tasks.filter((t) => t.kind === filter);
    return byKind;
  }, [data?.tasks, filter]);

  const searched = useSearchFilter(filtered, query, (t) =>
    `${t.employeeName} ${t.employeeCode} ${t.positionName} ${t.summary} ${t.proposal}`,
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AdminTask[]>();
    for (const task of searched) {
      const list = map.get(task.date) ?? [];
      list.push(task);
      map.set(task.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [searched]);

  const selectedTasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => selected.includes(t.id)),
    [data?.tasks, selected],
  );

  const actionableSelected = selectedTasks.filter((t) => bulkItem(t));

  async function run(body: Record<string, unknown>, key: string, message = 'Đã ghi nhận xử lý') {
    setBusy(key);
    try {
      const next = await api.post<WorkbenchData>('/api/admin/decisions', body);
      setData(next);
      setSelected((prev) => prev.filter((id) => next.tasks.some((t) => t.id === id)));
      toast.success(message);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function bulkApprove() {
    if (!actionableSelected.length) return;
    const items = actionableSelected.map(bulkItem).filter(Boolean);
    setBusy('bulk');
    try {
      const res = await api.post<{ ok: boolean; workbench: WorkbenchData }>(
        '/api/admin/timesheet/bulk-approve',
        { items },
      );
      setData(res.workbench);
      setSelected([]);
      toast.success(`Đã duyệt ${items.length} mục.`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  function toggleTask(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const canPayroll = me?.employee.role === 'admin' || me?.employee.role === 'hr';
  const kpis = data?.kpis;
  const counts = data?.counts ?? {};

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="row" style={{ gap: 8 }}>
            <span className="live-dot" />
            Trực vận hành
            {data ? <span className="muted">· {timeAgo(data.now)}</span> : null}
          </span>
        }
        title="Hộp việc hôm nay"
        description="Các điểm cần duyệt hoặc điều chỉnh trước khi chốt bảng công. Ưu tiên OT, thiếu chấm công và vắng mặt."
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void reload()} loading={loading}>
              Làm mới
            </Button>
            <Button variant="primary" icon={ListChecks} onClick={() => setFilter('all')}>
              {data ? `${data.tasks.length} việc cần xử lý` : 'Đang tải'}
            </Button>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {!data && loading ? (
        <div className="card">
          <div className="card-body">
            <LoadingBlock rows={5} label="Đang tải hộp việc" />
          </div>
        </div>
      ) : null}

      {data && kpis ? (
        <>
          <div className="kpi-grid kpi-grid-5">
            <StatCard
              label="Đang trong ca"
              value={
                <>
                  {kpis.active}
                  <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                    /{kpis.total}
                  </span>
                </>
              }
              sub="nhân viên đã chấm công vào"
              icon={CircleDot}
              tone="success"
            />
            <StatCard
              label="Đi muộn hôm nay"
              value={kpis.late}
              sub="cần xem lại nếu vượt mức cho phép"
              icon={Clock3}
              tone="warn"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
            />
            <StatCard
              label="Chưa chấm công"
              value={kpis.noPunch}
              sub="đã quá giờ vào ca 15 phút"
              icon={UserX}
              tone="danger"
              onClick={() => {
                setFilter('missing');
                setQuery('');
              }}
            />
            <StatCard
              label="Đơn chờ duyệt"
              value={kpis.pending}
              sub="nghỉ phép, OT, đổi ca…"
              icon={Inbox}
              tone="violet"
              onClick={() => {
                setFilter('leave');
                setQuery('');
              }}
            />
            <StatCard
              label="Việc cần xử lý"
              value={data.tasks.length}
              sub={`${kpis.taskBreakdown.ot} OT · ${kpis.taskBreakdown.missing} thiếu công · ${kpis.taskBreakdown.absence} vắng`}
              icon={ListChecks}
              tone="brand"
            />
          </div>

          <div className="content-grid">
            <div>
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-head">
                  <div>
                    <div className="card-title">
                      Hàng đợi xử lý <span className="muted">({searched.length})</span>
                    </div>
                    <div className="card-sub">Chọn nhiều mục để duyệt nhanh theo mặc định.</div>
                  </div>
                  <div className="card-tools">
                    <LabelSearch value={query} onChange={setQuery} />
                  </div>
                </div>
                <div className="card-body" style={{ paddingTop: 10 }}>
                  <div className="tabs" role="tablist" aria-label="Lọc loại việc">
                    {FILTERS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.value}
                        className={`tab ${filter === f.value ? 'is-active' : ''}`}
                        onClick={() => setFilter(f.value)}
                      >
                        {f.label}
                        <span className="tab-count">
                          {f.countKey ? counts[f.countKey] ?? 0 : data.tasks.length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {selected.length ? (
                    <div className="selected-bar" style={{ marginTop: 10 }}>
                      <Check size={15} />
                      Đã chọn {selected.length} mục
                      <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                        Bỏ chọn
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy === 'bulk'}
                        disabled={!actionableSelected.length}
                        onClick={() => void bulkApprove()}
                      >
                        Duyệt {actionableSelected.length} mục
                      </Button>
                    </div>
                  ) : null}

                  {!searched.length ? (
                    <EmptyState
                      icon={Sparkles}
                      title={data.tasks.length ? 'Không có việc khớp bộ lọc' : 'Hộp việc đang trống'}
                      description={
                        data.tasks.length
                          ? 'Thử bộ lọc khác hoặc xoá từ khoá tìm kiếm.'
                          : 'Mọi chấm công hôm nay đã được xử lý. Bạn có thể kiểm tra điều phối trực tiếp.'
                      }
                      action={
                        data.tasks.length ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setFilter('all');
                              setQuery('');
                            }}
                          >
                            Xoá bộ lọc
                          </Button>
                        ) : (
                          <Button size="sm" icon={Grid2X2} onClick={() => navigate('/app/dieu-phoi')}>
                            Mở điều phối
                          </Button>
                        )
                      }
                    />
                  ) : (
                    <div className="task-list">
                      {grouped.map(([date, tasks]) => (
                        <div key={date}>
                          <div className="task-date-label">
                            {dateShort(date)}
                            <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
                              {tasks.length} mục
                            </span>
                          </div>
                          {tasks.map((task) => {
                            const meta = KIND_META[task.kind];
                            const Icon = meta.icon;
                            const actionable = isActionable(task);
                            const checked = selected.includes(task.id);
                            return (
                              <div
                                key={task.id}
                                className={`task-card task-${task.severity} ${checked ? 'is-selected' : ''}`}
                              >
                                <div className="task-check">
                                  <Checkbox
                                    checked={checked}
                                    onChange={() => toggleTask(task.id)}
                                    disabled={!actionable}
                                    label={<span className="sr-only">Chọn {task.employeeName}</span>}
                                  />
                                </div>
                                <div className="task-body">
                                  <div className="task-head">
                                    <div className="task-person">
                                      <Avatar name={task.employeeName} size={30} toneKey={task.employeeId} />
                                      <div className="cell-person-copy">
                                        <div className="task-person-name">{task.employeeName}</div>
                                        <div className="task-person-meta">
                                          <Icon size={11} />
                                          {task.positionName} · {task.employeeCode}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="task-head-right">
                                      <Badge tone={meta.tone}>{meta.label}</Badge>
                                      {task.shiftCode ? (
                                        <Badge tone="outline">
                                          {task.shiftCode} {task.shiftTime ? `· ${task.shiftTime}` : ''}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="task-title">{task.summary}</div>
                                  <div className="task-proposal">
                                    <ArrowGlyph />
                                    {task.proposal}
                                  </div>

                                  <div className="task-foot">
                                    {task.requestId ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="success"
                                          icon={Check}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            setRequestDecision({ task, action: 'approve', note: '' })
                                          }
                                        >
                                          Duyệt đơn
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="danger"
                                          icon={X}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            setRequestDecision({ task, action: 'reject', note: '' })
                                          }
                                        >
                                          Từ chối
                                        </Button>
                                      </>
                                    ) : null}

                                    {task.kind === 'ot' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="success"
                                          icon={Check}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'ot',
                                                action: 'approve',
                                                minutes: task.minutes ?? task.day.otMinutes,
                                              },
                                              task.id,
                                              'Đã duyệt OT.',
                                            )
                                          }
                                        >
                                          Duyệt {task.minutes ?? task.day.otMinutes} phút
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            setOtAdjust({
                                              task,
                                              minutes: String(task.minutes ?? task.day.otMinutes),
                                            })
                                          }
                                        >
                                          Sửa số phút
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          icon={X}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'ot',
                                                action: 'reject',
                                              },
                                              task.id,
                                              'Đã từ chối OT.',
                                            )
                                          }
                                        >
                                          Không tính OT
                                        </Button>
                                      </>
                                    ) : null}

                                    {task.kind === 'missing' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="success"
                                          icon={Check}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'missing',
                                                cong: 1,
                                              },
                                              task.id,
                                              'Đã duyệt 1 công.',
                                            )
                                          }
                                        >
                                          1 công
                                        </Button>
                                        <Button
                                          size="sm"
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'missing',
                                                cong: 0.5,
                                              },
                                              task.id,
                                              'Đã duyệt 0,5 công.',
                                            )
                                          }
                                        >
                                          0,5 công
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'missing',
                                                cong: 0,
                                              },
                                              task.id,
                                              'Đã ghi nhận 0 công.',
                                            )
                                          }
                                        >
                                          0 công
                                        </Button>
                                      </>
                                    ) : null}

                                    {task.kind === 'absence' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="success"
                                          icon={Check}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'absence',
                                                action: 'count',
                                              },
                                              task.id,
                                              'Đã tính 1 công.',
                                            )
                                          }
                                        >
                                          Tính công
                                        </Button>
                                        <Button
                                          size="sm"
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'absence',
                                                action: 'half',
                                              },
                                              task.id,
                                              'Đã tính nửa công.',
                                            )
                                          }
                                        >
                                          Nửa công
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'absence',
                                                action: 'accept',
                                              },
                                              task.id,
                                              'Đã ghi nhận vắng không công.',
                                            )
                                          }
                                        >
                                          Vắng không công
                                        </Button>
                                      </>
                                    ) : null}

                                    {task.kind === 'outside' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="success"
                                          icon={Check}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'outside',
                                                action: 'accept',
                                              },
                                              task.id,
                                              'Đã chấp nhận chấm công ngoài vùng.',
                                            )
                                          }
                                        >
                                          Chấp nhận
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          icon={X}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'outside',
                                                action: 'reject',
                                              },
                                              task.id,
                                              'Đã từ chối chấm công ngoài vùng.',
                                            )
                                          }
                                        >
                                          Từ chối
                                        </Button>
                                      </>
                                    ) : null}

                                    {task.kind === 'wrong_shift' ? (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="success"
                                          icon={Check}
                                          disabled={busy === task.id}
                                          onClick={() =>
                                            void run(
                                              {
                                                employeeId: task.employeeId,
                                                date: task.date,
                                                kind: 'wrong_shift',
                                                action: 'accept',
                                              },
                                              task.id,
                                              'Đã chấp nhận ca thực tế.',
                                            )
                                          }
                                        >
                                          Giữ ca này
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            setShiftChange({
                                              task,
                                              shiftId: task.shiftId ?? data.shifts[0]?.id ?? '',
                                            })
                                          }
                                        >
                                          Đổi sang ca khác
                                        </Button>
                                      </>
                                    ) : null}

                                    <button
                                      type="button"
                                      className="task-why"
                                      onClick={() => setOpenWhy(openWhy === task.id ? null : task.id)}
                                      aria-expanded={openWhy === task.id}
                                    >
                                      <Info size={13} />
                                      Vì sao?
                                    </button>
                                  </div>

                                  {openWhy === task.id ? (
                                    <div className="task-reason">
                                      <strong>Lý do hệ thống đề xuất: </strong>
                                      {task.why}
                                      <div style={{ marginTop: 6 }}>
                                        <Link
                                          to={`/app/bang-cong?employee=${task.employeeId}&date=${task.date}`}
                                          className="row"
                                          style={{ gap: 4, color: 'var(--brand)', fontWeight: 500 }}
                                        >
                                          Mở bảng công của {task.employeeName}
                                          <ChevronRight size={13} />
                                        </Link>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className="rail">
              <div className="rail-card">
                <div className="rail-head">
                  <span className="rail-title">
                    <ListChecks size={14} />
                    Cơ cấu việc cần xử lý
                  </span>
                  <Badge tone="slate">{data.tasks.length}</Badge>
                </div>
                <div className="rail-body">
                  <div className="breakdown">
                    {(
                      [
                        ['ot', 'Làm thêm', 'var(--violet)'],
                        ['missing', 'Thiếu chấm công', 'var(--red)'],
                        ['absence', 'Vắng mặt', 'var(--amber)'],
                        ['outside', 'Ngoài vùng', 'var(--sky)'],
                        ['wrong_shift', 'Sai ca', 'var(--muted-2)'],
                        ['leave', 'Đơn từ', 'var(--brand)'],
                      ] as const
                    ).map(([key, label, color]) => {
                      const value = counts[key] ?? 0;
                      return (
                        <div className="breakdown-row" key={key}>
                          <span className="breakdown-label">
                            <i style={{ background: color }} />
                            {label}
                          </span>
                          <span className="breakdown-value">{value}</span>
                          <Progress
                            value={value}
                            max={Math.max(1, data.tasks.length)}
                            height={4}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rail-card" style={{ marginTop: 14 }}>
                <div className="rail-head">
                  <span className="rail-title">
                    <Sparkles size={14} />
                    Lối tắt
                  </span>
                </div>
                <div className="rail-body" style={{ padding: 6 }}>
                  <div className="quick-list">
                    <QuickLink
                      icon={Grid2X2}
                      title="Điều phối trực tiếp"
                      sub="Ai đang ở đâu, vào ca lúc nào"
                      onClick={() => navigate('/app/dieu-phoi')}
                    />
                    <QuickLink
                      icon={CalendarRange}
                      title="Xếp ca tuần này"
                      sub="Phân ca theo nhóm thứ"
                      onClick={() => navigate('/app/xep-ca')}
                    />
                    {canPayroll ? (
                      <QuickLink
                        icon={Wallet}
                        title="Chốt bảng lương"
                        sub="Kiểm tra công và OT trước khi công bố"
                        onClick={() => navigate('/app/luong')}
                      />
                    ) : null}
                    <QuickLink
                      icon={FileText}
                      title="Mở ứng dụng nhân viên"
                      sub="Giao diện chấm công trên điện thoại"
                      onClick={() => navigate('/m/')}
                    />
                  </div>
                </div>
              </div>

              <div className="tip-card" style={{ marginTop: 14 }}>
                <strong>
                  <Info size={14} />
                  Mẹo xử lý nhanh
                </strong>
                Chọn nhiều mục rồi bấm “Duyệt n mục” để áp dụng mặc định: OT đúng số phút đề xuất, thiếu
                chấm công tính 1 công, vắng mặt tính công, ngoài vùng và sai ca chấp nhận.
              </div>
            </aside>
          </div>
        </>
      ) : null}

      <Modal
        open={!!otAdjust}
        onClose={() => setOtAdjust(null)}
        title="Điều chỉnh số phút làm thêm"
        description={otAdjust ? `${otAdjust.task.employeeName} · ${dateShort(otAdjust.task.date)}` : undefined}
        size="sm"
        footer={
          <>
            <Button onClick={() => setOtAdjust(null)}>Huỷ</Button>
            <Button
              variant="primary"
              loading={busy === otAdjust?.task.id}
              onClick={() => {
                if (!otAdjust) return;
                const minutes = Number(otAdjust.minutes);
                if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
                  toast.error('Số phút phải trong khoảng 0–1440.');
                  return;
                }
                const taskId = otAdjust.task.id;
                void run(
                  {
                    employeeId: otAdjust.task.employeeId,
                    date: otAdjust.task.date,
                    kind: 'ot',
                    action: 'adjust',
                    minutes,
                  },
                  taskId,
                  `Đã duyệt ${minutes} phút OT.`,
                ).then(() => setOtAdjust(null));
              }}
            >
              Lưu và duyệt
            </Button>
          </>
        }
      >
        {otAdjust ? (
          <Field label="Số phút OT được duyệt" hint="OT dưới ngưỡng tối thiểu của ca sẽ không được tính.">
            <Input
              type="number"
              min={0}
              max={1440}
              value={otAdjust.minutes}
              onChange={(e) => setOtAdjust({ ...otAdjust, minutes: e.target.value })}
              autoFocus
            />
          </Field>
        ) : null}
      </Modal>

      <Modal
        open={!!shiftChange}
        onClose={() => setShiftChange(null)}
        title="Đổi ca thực tế"
        description={shiftChange ? `${shiftChange.task.employeeName} · ${dateShort(shiftChange.task.date)}` : undefined}
        footer={
          <>
            <Button onClick={() => setShiftChange(null)}>Huỷ</Button>
            <Button
              variant="primary"
              loading={busy === shiftChange?.task.id}
              onClick={() => {
                if (!shiftChange) return;
                const { task, shiftId } = shiftChange;
                if (!shiftId) {
                  toast.error('Chọn ca cần áp dụng.');
                  return;
                }
                void run(
                  {
                    employeeId: task.employeeId,
                    date: task.date,
                    kind: 'wrong_shift',
                    action: 'change',
                    shiftId,
                  },
                  task.id,
                  'Đã đổi ca và chấp nhận chấm công.',
                ).then(() => setShiftChange(null));
              }}
            >
              Áp dụng
            </Button>
          </>
        }
      >
        {shiftChange ? (
          <Field label="Ca áp dụng cho ngày này">
            <Select
              value={shiftChange.shiftId}
              onChange={(e) => setShiftChange({ ...shiftChange, shiftId: e.target.value })}
            >
              {(data?.shifts ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name} ({s.start}–{s.end})
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </Modal>

      <Modal
        open={!!requestDecision}
        onClose={() => setRequestDecision(null)}
        title={requestDecision?.action === 'approve' ? 'Duyệt đơn' : 'Từ chối đơn'}
        description={
          requestDecision
            ? `${requestDecision.task.employeeName} · ${requestDecision.task.summary}`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button onClick={() => setRequestDecision(null)}>Huỷ</Button>
            <Button
              variant={requestDecision?.action === 'approve' ? 'success' : 'danger'}
              loading={busy === requestDecision?.task.id}
              onClick={() => {
                if (!requestDecision) return;
                const { task, action, note } = requestDecision;
                void run(
                  { requestId: task.requestId, action, note },
                  task.id,
                  action === 'approve' ? 'Đã duyệt đơn.' : 'Đã từ chối đơn.',
                ).then(() => setRequestDecision(null));
              }}
            >
              {requestDecision?.action === 'approve' ? 'Duyệt đơn' : 'Từ chối'}
            </Button>
          </>
        }
      >
        {requestDecision ? (
          <Field label="Ghi chú gửi nhân viên" hint="Không bắt buộc. Nội dung sẽ hiện trong thông báo.">
            <Textarea
              rows={3}
              value={requestDecision.note}
              onChange={(e) => setRequestDecision({ ...requestDecision, note: e.target.value })}
              placeholder="Ví dụ: Đã xác nhận với quản lý ca."
            />
          </Field>
        ) : null}
      </Modal>
    </>
  );
}

function ArrowGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 10L10 2M10 2H4M10 2V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LabelSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="toolbar-search" style={{ maxWidth: 220 }}>
      <Search size={14} />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tìm nhân viên, nội dung…"
        aria-label="Tìm việc cần xử lý"
      />
    </div>
  );
}

function QuickLink({
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="quick-link" onClick={onClick}>
      <Icon size={15} />
      <span>
        {title}
        <small>{sub}</small>
      </span>
      <ChevronRight size={14} className="quick-arrow" />
    </button>
  );
}
