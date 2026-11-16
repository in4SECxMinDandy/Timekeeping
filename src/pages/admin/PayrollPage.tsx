import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Lock,
  Plus,
  ReceiptText,
  RotateCcw,
  Send,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Textarea,
} from '../../components/ui';
import { ConfirmModal, NoAccess } from '../../components/Confirm';
import { useAsync } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/session';
import { useToast } from '../../lib/toast';
import {
  DAY_STATUS_LABEL,
  dateShort,
  fmtMoney,
  fmtNumber,
  fmtPeriodVN,
  formatMinutes,
  minutesToHm,
  periodLabel,
  todayIct,
  weekdayLabel,
} from '../../lib/format';
import type {
  AdminEmployeePayroll,
  DayResult,
  Employee,
  PayrollData,
  PayrollRow,
} from '../../lib/types';

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayDotClass(day: DayResult): string {
  if (day.status === 'late') return 'pay-day-dot is-warn';
  if (day.status === 'missing' || day.status === 'absent') return 'pay-day-dot is-bad';
  if (day.status === 'ok' || day.status === 'inprogress' || day.status === 'leave') return 'pay-day-dot';
  return 'pay-day-dot is-off';
}

function punchKindTone(status: DayResult['status']): string {
  if (status === 'ok' || status === 'late' || status === 'inprogress') return 'punch-kind-in';
  if (status === 'missing' || status === 'absent') return 'punch-kind-out';
  return 'punch-kind-off';
}

export default function PayrollPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canPayroll = me?.employee.role === 'admin' || me?.employee.role === 'hr';
  const [period, setPeriod] = useState(() => todayIct().slice(0, 7));
  const [selected, setSelected] = useState<PayrollRow | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload, setData } = useAsync<PayrollData>(
    () =>
      canPayroll
        ? api.get(`/api/admin/payroll?period=${period}`)
        : Promise.resolve(null as unknown as PayrollData),
    [period, canPayroll],
  );

  const rows = data?.rows ?? [];
  const topOt = useMemo(() => {
    return [...rows].sort((a, b) => b.slip.otMinutes - a.slip.otMinutes).slice(0, 5);
  }, [rows]);

  if (!canPayroll) return <NoAccess title="Bảng lương chỉ dành cho quản trị viên và nhân sự" />;

  const publish = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ count: number; total: number; data: PayrollData }>(
        '/api/admin/payroll/publish',
        { period },
      );
      setData(result.data);
      setPublishOpen(false);
      toast.success(`Đã công bố phiếu lương cho ${result.count} nhân viên.`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const next = await api.post<PayrollData>('/api/admin/payroll/revoke', { period });
      setData(next);
      setRevokeOpen(false);
      toast.success('Đã thu hồi bảng lương. Bạn có thể điều chỉnh và công bố lại.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <>
            <Wallet size={13} /> Tính lương
          </>
        }
        title="Bảng lương"
        description="Kiểm tra công, làm thêm và các khoản điều chỉnh trước khi công bố phiếu lương cho nhân viên."
        actions={
          <>
            <div className="period-nav">
              <button type="button" aria-label="Kỳ trước" onClick={() => setPeriod(shiftPeriod(period, -1))}>
                <ChevronLeft size={16} />
              </button>
              <span className="period-nav-label">{periodLabel(period)}</span>
              <button type="button" aria-label="Kỳ sau" onClick={() => setPeriod(shiftPeriod(period, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <a
              className="btn btn-secondary btn-md"
              href={`/api/admin/export/payroll?period=${period}`}
            >
              <Download size={16} />
              <span>Xuất Excel</span>
            </a>
            {data?.status === 'published' ? (
              <Button variant="danger" icon={RotateCcw} onClick={() => setRevokeOpen(true)}>
                Thu hồi
              </Button>
            ) : (
              <Button variant="primary" icon={Send} onClick={() => setPublishOpen(true)}>
                Công bố lương
              </Button>
            )}
          </>
        }
      />

      <div className="payroll-bar">
        <div className="payroll-status">
          {data?.status === 'published' ? (
            <>
              <Badge tone="success" dot>
                Đã công bố
              </Badge>
              <span>
                <strong>{fmtPeriodVN(period)}</strong>
                {data.published?.publishedAt
                  ? ` · ${dateShort(data.published.publishedAt.slice(0, 10))} lúc ${data.published.publishedAt.slice(11, 16)}`
                  : ''}
              </span>
            </>
          ) : (
            <>
              <Badge tone="warn" dot>
                Đang mở
              </Badge>
              <span>
                <strong>{data?.summary.readyRows ?? 0}</strong> nhân viên sẵn sàng ·{' '}
                <strong>{data?.summary.actionRows ?? 0}</strong> cần xử lý
              </span>
            </>
          )}
        </div>
        <div className="payroll-status">
          <ReceiptText size={14} />
          <span>
            Tổng thực lĩnh <strong>{fmtMoney(data?.summary.total ?? 0)}</strong>
          </span>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : loading || !data ? (
        <div className="card">
          <LoadingBlock rows={5} />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <StatCard
              label="Quỹ lương tháng"
              value={fmtMoney(data.summary.total)}
              sub={`${data.summary.employees} nhân viên`}
              icon={Wallet}
              tone="brand"
            />
            <StatCard
              label="Làm thêm đã duyệt"
              value={formatMinutes(data.summary.otMinutes)}
              sub={`${data.summary.otPeople} người có OT`}
              icon={ArrowUpRight}
              tone="violet"
            />
            <StatCard
              label="OT chờ duyệt"
              value={formatMinutes(data.summary.pendingOt)}
              sub={`Tạm tính ${fmtMoney(data.summary.pendingOtValue)}`}
              icon={AlertCircle}
              tone="warn"
            />
            <StatCard
              label="Cần xử lý"
              value={data.summary.actionRows}
              sub="thiếu công hoặc OT chưa duyệt"
              icon={AlertCircle}
              tone={data.summary.actionRows ? 'danger' : 'success'}
            />
          </div>

          <div className="content-grid content-grid-wide">
            <div className="card">
              <div className="card-head is-bordered">
                <div>
                  <div className="card-title">
                    <ReceiptText size={16} /> Phiếu lương {fmtPeriodVN(period)}
                  </div>
                  <div className="card-sub">
                    Bấm vào nhân viên để xem chi tiết, thêm thưởng hoặc khấu trừ.
                  </div>
                </div>
                <div className="card-tools">
                  <Badge tone={data.status === 'published' ? 'success' : 'outline'}>
                    {data.status === 'published' ? 'Đã chốt' : 'Tạm tính'}
                  </Badge>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table pay-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th className="center">Công</th>
                      <th>OT</th>
                      <th className="right">Lương cơ bản</th>
                      <th className="right">Tiền OT</th>
                      <th className="right">Phụ cấp</th>
                      <th className="right">Thưởng/phạt</th>
                      <th className="right">BHXH</th>
                      <th className="right">Thực lĩnh</th>
                      <th>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.slip.employeeId}
                        className={`${row.readiness === 'action' ? 'row-warn' : ''} ${
                          row.frozen ? 'pay-frozen' : ''
                        }`}
                      >
                        <td>
                          <div className="employee-cell">
                            <Avatar name={row.slip.name} size={30} />
                            <div className="employee-cell-copy">
                              <div className="employee-name">
                                {row.slip.name}
                                {row.slip.salaryType === 'hour' ? (
                                  <Badge tone="sky">Theo giờ</Badge>
                                ) : row.slip.salaryType === 'shift' ? (
                                  <Badge tone="violet">Theo ca</Badge>
                                ) : null}
                              </div>
                              <div className="employee-email">
                                {row.employee?.code ?? ''} · {row.slip.positionName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="center pay-cong">
                          <div className="strong">{fmtNumber(row.slip.cong)}</div>
                          <div className="pay-days">
                            {row.days.map((d) => (
                              <i
                                key={d.date}
                                className={dayDotClass(d)}
                                title={`${dateShort(d.date)} · ${DAY_STATUS_LABEL[d.status] ?? d.status}`}
                              />
                            ))}
                          </div>
                        </td>
                        <td>
                          {row.slip.otMinutes ? (
                            <span className="strong">{formatMinutes(row.slip.otMinutes)}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="right money">{fmtMoney(row.slip.basePay)}</td>
                        <td className="right money">{fmtMoney(row.slip.otPay)}</td>
                        <td className="right money">
                          {fmtMoney(row.slip.allowances + row.slip.fixedBonus)}
                        </td>
                        <td className={`right money ${row.slip.adjustments < 0 ? 'money-neg' : ''}`}>
                          {row.slip.adjustments ? fmtMoney(row.slip.adjustments) : '—'}
                        </td>
                        <td className="right money money-neg">-{fmtMoney(row.slip.insurance)}</td>
                        <td className="right money money-strong">{fmtMoney(row.slip.net)}</td>
                        <td>
                          <div className="pay-readiness">
                            {row.readiness === 'ready' ? (
                              <span>
                                <CheckCircle2 size={12} /> Sẵn sàng
                              </span>
                            ) : (
                              row.issues.slice(0, 2).map((issue) => (
                                <span key={issue} className="pay-issues">
                                  <AlertCircle size={12} /> {issue}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelected(row)}
                            >
                              Chi tiết
                            </Button>
                            {!row.frozen ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={Plus}
                                onClick={() => row.employee && setAdjustFor(row.employee)}
                                aria-label="Thêm thưởng phạt"
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Tổng cộng</td>
                      <td className="center">{fmtNumber(rows.reduce((s, r) => s + r.slip.cong, 0))}</td>
                      <td>{formatMinutes(data.summary.otMinutes)}</td>
                      <td className="right money">{fmtMoney(rows.reduce((s, r) => s + r.slip.basePay, 0))}</td>
                      <td className="right money">{fmtMoney(rows.reduce((s, r) => s + r.slip.otPay, 0))}</td>
                      <td className="right money">
                        {fmtMoney(rows.reduce((s, r) => s + r.slip.allowances + r.slip.fixedBonus, 0))}
                      </td>
                      <td className="right money">
                        {fmtMoney(rows.reduce((s, r) => s + r.slip.adjustments, 0))}
                      </td>
                      <td className="right money money-neg">
                        -{fmtMoney(rows.reduce((s, r) => s + r.slip.insurance, 0))}
                      </td>
                      <td className="right money money-strong">{fmtMoney(data.summary.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="rail">
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">
                      <ArrowUpRight size={15} /> Làm thêm nổi bật
                    </div>
                    <div className="card-sub">Top nhân viên theo phút OT đã duyệt</div>
                  </div>
                </div>
                <div className="card-body is-tight">
                  {topOt.every((r) => r.slip.otMinutes === 0) ? (
                    <EmptyState
                      compact
                      title="Chưa có làm thêm"
                      description="OT sẽ xuất hiện sau khi quản lý duyệt."
                    />
                  ) : (
                    topOt.map((row) =>
                      row.slip.otMinutes ? (
                        <button
                          key={row.slip.employeeId}
                          type="button"
                          className="quick-link"
                          onClick={() => setSelected(row)}
                        >
                          <Avatar name={row.slip.name} size={28} />
                          <span className="grow">
                            <span className="truncate" style={{ display: 'block' }}>
                              {row.slip.name}
                            </span>
                            <span className="muted tiny">{row.slip.positionName}</span>
                          </span>
                          <span className="strong">{formatMinutes(row.slip.otMinutes)}</span>
                        </button>
                      ) : null,
                    )
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">
                      <Lock size={15} /> Kỳ đã công bố
                    </div>
                    <div className="card-sub">Dữ liệu lương đã chốt gần đây</div>
                  </div>
                </div>
                <div className="card-body is-tight">
                  {data.publishedPeriods.length === 0 ? (
                    <p className="muted tiny">Chưa có kỳ lương nào được công bố.</p>
                  ) : (
                    data.publishedPeriods.slice(0, 6).map((p) => (
                      <button
                        key={p.period}
                        type="button"
                        className="quick-link"
                        onClick={() => setPeriod(p.period)}
                      >
                        <Lock size={14} />
                        <span className="grow">{fmtPeriodVN(p.period)}</span>
                        <span className="muted tiny">
                          {p.publishedAt ? dateShort(p.publishedAt.slice(0, 10)) : ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {data.status !== 'published' ? (
                <div className="tip-card">
                  <div className="tip-title">Trước khi công bố</div>
                  <p>
                    Xử lý các dòng cần chú ý để tránh sai lệch công. Phiếu lương sau khi
                    công bố sẽ được gửi tới ứng dụng nhân viên và không thể sửa trực tiếp.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={publish}
        busy={busy}
        tone="primary"
        title={`Công bố lương ${fmtPeriodVN(period)}?`}
        description="Hành động này sẽ chốt số liệu và gửi thông báo phiếu lương tới toàn bộ nhân viên đang làm việc."
        confirmLabel="Công bố"
      >
        <div className="callout">
          <strong>{data?.summary.employees ?? 0}</strong> phiếu lương ·{' '}
          <strong>{fmtMoney(data?.summary.total ?? 0)}</strong> tổng thực lĩnh.
          {data?.summary.actionRows ? (
            <p style={{ marginTop: 6 }}>
              Còn {data.summary.actionRows} nhân viên cần xử lý công hoặc OT trước khi
              chốt.
            </p>
          ) : null}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={revoke}
        busy={busy}
        title="Thu hồi bảng lương đã công bố?"
        description="Phiếu lương sẽ bị gỡ khỏi ứng dụng nhân viên. Bạn có thể điều chỉnh rồi công bố lại."
        confirmLabel="Thu hồi"
      />

      {selected ? (
        <PayrollDrawer
          row={selected}
          period={period}
          published={data?.status === 'published'}
          onClose={() => setSelected(null)}
          onAdjust={(employee) => setAdjustFor(employee)}
          onData={setData}
        />
      ) : null}

      <AdjustModal
        employee={adjustFor}
        period={period}
        onClose={() => setAdjustFor(null)}
        onDone={(next) => {
          setData(next);
          setAdjustFor(null);
        }}
      />
    </div>
  );
}

function PayrollDrawer({
  row,
  period,
  published,
  onClose,
  onAdjust,
  onData,
}: {
  row: PayrollRow;
  period: string;
  published: boolean;
  onClose: () => void;
  onAdjust: (employee: Employee) => void;
  onData: (data: PayrollData) => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<AdminEmployeePayroll | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<AdminEmployeePayroll>(
        `/api/admin/payroll/${row.slip.employeeId}?period=${period}`,
      );
      setDetail(data);
      setError('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.slip.employeeId, period]);

  const removeAdjustment = async (id: string) => {
    try {
      const next = await api.del<PayrollData>(
        `/api/admin/payroll/adjustments/${id}?period=${period}`,
      );
      onData(next);
      toast.success('Đã xoá khoản điều chỉnh.');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const months = [...(detail?.months ?? [])].reverse();
  const maxNet = Math.max(1, ...months.map((m) => m.net));

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={row.slip.name}
      description={`${row.slip.positionName} · ${fmtPeriodVN(period)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          {!published && row.employee ? (
            <Button variant="primary" icon={Plus} onClick={() => onAdjust(row.employee!)}>
              Thưởng / phạt
            </Button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <LoadingBlock rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : detail ? (
        <>
          <div className="drawer-section">
            <div className="between">
              <Badge tone={detail.published ? 'success' : 'outline'}>
                {detail.published ? 'Đã công bố' : 'Tạm tính'}
              </Badge>
              <span className="muted tiny">
                {fmtNumber(detail.summary.cong)}/{row.slip.standardDays} công chuẩn
              </span>
            </div>
            <div className="day-stat-grid">
              <div className="day-stat">
                <div className="day-stat-label">Lương cơ bản</div>
                <div className="day-stat-value" style={{ fontSize: 12.5 }}>
                  {fmtMoney(detail.summary.basePay)}
                </div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">OT</div>
                <div className="day-stat-value" style={{ fontSize: 12.5 }}>
                  {fmtMoney(detail.summary.otPay)}
                </div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">Phụ cấp</div>
                <div className="day-stat-value" style={{ fontSize: 12.5 }}>
                  {fmtMoney(detail.summary.allowances)}
                </div>
              </div>
              <div className="day-stat">
                <div className="day-stat-label">Thực lĩnh</div>
                <div className="day-stat-value" style={{ fontSize: 12.5, color: 'var(--green-600)' }}>
                  {fmtMoney(detail.summary.net)}
                </div>
              </div>
            </div>
            <div className="slip-lines">
              {detail.summary.lines.map((line) => (
                <div className="slip-line" key={line.label}>
                  <span>{line.label}</span>
                  <span className={`money ${line.amount < 0 ? 'money-neg' : ''}`}>
                    {fmtMoney(line.amount)}
                  </span>
                </div>
              ))}
              <div className="slip-line slip-total">
                <span>Thực lĩnh</span>
                <span className="money">{fmtMoney(detail.summary.net)}</span>
              </div>
            </div>
          </div>

          <div className="drawer-section">
            <h3 className="drawer-section-title">Xu hướng thu nhập</h3>
            <div className="trend-chart">
              {months.map((m) => (
                <div
                  className={`trend-col ${m.period === period ? 'is-current' : ''}`}
                  key={m.period}
                >
                  <span className="trend-val">{fmtMoney(m.net)}</span>
                  <div
                    className="trend-bar"
                    style={{ height: `${Math.max(4, (m.net / maxNet) * 100)}%` }}
                    title={`${fmtPeriodVN(m.period)} · ${fmtMoney(m.net)}`}
                  />
                  <span className="trend-label">T{m.period.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="drawer-section">
            <h3 className="drawer-section-title">Chấm công trong kỳ</h3>
            {row.days.map((day) => (
              <div className="punch-line" key={day.date}>
                <span className={`punch-kind ${punchKindTone(day.status)}`}>
                  {weekdayLabel(day.weekday).replace('Thứ ', 'T')}
                </span>
                <span className="grow">
                  {dateShort(day.date)} · {DAY_STATUS_LABEL[day.status] ?? day.status}
                  {day.lateMinutes ? ` · muộn ${day.lateMinutes}p` : ''}
                  {day.otMinutes ? ` · OT ${day.otMinutes}p` : ''}
                </span>
                <span className="strong">{fmtNumber(day.cong)} công</span>
              </div>
            ))}
          </div>

          {!detail.published ? (
            <div className="drawer-section">
              <h3 className="drawer-section-title">Khoản điều chỉnh</h3>
              {row.adjustments === 0 ? (
                <p className="muted tiny">Chưa có thưởng hoặc phạt nào trong kỳ.</p>
              ) : (
                <div className="slip-lines">
                  <div className="slip-line">
                    <span>Tổng điều chỉnh</span>
                    <span className={`money ${row.adjustments < 0 ? 'money-neg' : ''}`}>
                      {fmtMoney(row.adjustments)}
                    </span>
                  </div>
                </div>
              )}
              <AdjustmentList
                employeeId={row.slip.employeeId}
                period={period}
                onDelete={removeAdjustment}
              />
            </div>
          ) : null}

          <div className="drawer-section">
            <h3 className="drawer-section-title">Lịch sử sáu tháng</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kỳ</th>
                    <th className="right">Công</th>
                    <th className="right">OT</th>
                    <th className="right">Thực lĩnh</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.months.map((m) => (
                    <tr key={m.period}>
                      <td>{fmtPeriodVN(m.period)}</td>
                      <td className="right">{fmtNumber(m.cong)}</td>
                      <td className="right">{formatMinutes(m.otMinutes)}</td>
                      <td className="right money">{fmtMoney(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </Drawer>
  );
}

function AdjustmentList({
  employeeId,
  period,
  onDelete,
}: {
  employeeId: string;
  period: string;
  onDelete: (id: string) => void;
}) {
  const { data } = useAsync<PayrollData>(
    () => api.get(`/api/admin/payroll?period=${period}`),
    [period],
  );
  const items = (data?.bonuses ?? []).filter((b) => b.employeeId === employeeId);
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {items.map((b) => (
        <div className="punch-line" key={b.id}>
          <span className={`money ${b.amount < 0 ? 'money-neg' : 'money-pos'}`}>
            {b.amount > 0 ? '+' : ''}
            {fmtMoney(b.amount)}
          </span>
          <span className="grow">{b.reason}</span>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label="Xoá điều chỉnh"
            onClick={() => onDelete(b.id)}
          />
        </div>
      ))}
    </div>
  );
}

function AdjustModal({
  employee,
  period,
  onClose,
  onDone,
}: {
  employee: Employee | null;
  period: string;
  onClose: () => void;
  onDone: (data: PayrollData) => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount('');
    setReason('');
  }, [employee]);

  const submit = async () => {
    if (!employee) return;
    const value = Number(amount);
    if (!value) {
      toast.error('Số tiền phải khác 0.');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Nhập lý do điều chỉnh.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<PayrollData>('/api/admin/payroll/adjustments', {
        employeeId: employee.id,
        period,
        amount: Math.round(value),
        reason: reason.trim(),
      });
      onDone(data);
      toast.success('Đã thêm khoản điều chỉnh.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      title="Thưởng / phạt"
      description={employee ? `${employee.name} · ${fmtPeriodVN(period)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Thêm điều chỉnh
          </Button>
        </>
      }
    >
      <Field
        label="Số tiền (VND)"
        hint="Số dương là thưởng, số âm là khấu trừ. Ví dụ: 500000 hoặc -200000."
      >
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500000"
          autoFocus
        />
      </Field>
      <Field label="Lý do" required>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Ví dụ: thưởng dự án tháng 10"
        />
      </Field>
      <p className="muted tiny" style={{ marginTop: 4 }}>
        Khoản điều chỉnh chỉ áp dụng cho kỳ {fmtPeriodVN(period)} và không làm thay đổi
        công đã chấm.
      </p>
    </Modal>
  );
}
