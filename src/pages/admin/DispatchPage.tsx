import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Clock3,
  MapPin,
  Radar,
  RefreshCw,
  Search,
  Smartphone,
  Timer,
  TriangleAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  StatCard,
  useSearchFilter,
  type BadgeTone,
} from '../../components/ui';
import OfflineMap from '../../components/OfflineMap';
import { useAsync } from '../../lib/hooks';
import { api } from '../../lib/api';
import { clockLabel, dateLong, formatMinutes, timeAgo } from '../../lib/format';
import type { DispatchData, DispatchRow } from '../../lib/types';

const STATUS: Record<
  DispatchRow['status'],
  { label: string; tone: BadgeTone; dot: string }
> = {
  active: { label: 'Đang trong ca', tone: 'success', dot: 'var(--green)' },
  late: { label: 'Vào muộn', tone: 'warn', dot: 'var(--amber)' },
  after: { label: 'Chưa chấm ra', tone: 'danger', dot: 'var(--red)' },
  outside: { label: 'Ngoài vùng', tone: 'warn', dot: 'var(--amber)' },
  done: { label: 'Đã về', tone: 'slate', dot: '#98a2b3' },
  not_in: { label: 'Chưa vào ca', tone: 'danger', dot: 'var(--red)' },
  upcoming: { label: 'Sắp vào ca', tone: 'brand', dot: 'var(--brand)' },
};

function pinTone(status: DispatchRow['status']): 'brand' | 'green' | 'amber' | 'slate' | 'red' {
  if (status === 'active') return 'green';
  if (status === 'done') return 'slate';
  if (status === 'late' || status === 'outside' || status === 'after') return 'amber';
  if (status === 'not_in') return 'red';
  return 'brand';
}

export default function DispatchPage() {
  const { data, error, loading, reload } = useAsync<DispatchData>(() =>
    api.get('/api/admin/dispatch'),
  );
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => void reload(true), 45_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const rows = useMemo(() => {
    let list = data?.rows ?? [];
    if (status !== 'all') list = list.filter((r) => r.status === status);
    return list;
  }, [data?.rows, status]);

  const filtered = useSearchFilter(rows, query, (r) =>
    `${r.employee.name} ${r.employee.code} ${r.shift?.name ?? ''} ${r.location?.name ?? ''}`,
  );

  const selected = data?.rows.find((r) => r.employee.id === selectedId);
  const kpis = data?.kpis;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="row" style={{ gap: 8 }}>
            <Radar size={13} />
            Bảng điều phối trực tiếp
          </span>
        }
        title="Điều phối chấm công"
        description="Theo dõi ai đang trong ca, ai vào muộn hoặc chấm công ngoài vùng theo thời gian thực."
        actions={
          <>
            <span className="live-pill">
              <span className="live-dot" />
              Trực tiếp {data ? clockLabel(data.now) : '—'}
            </span>
            <Button icon={RefreshCw} loading={loading} onClick={() => void reload()}>
              Làm mới
            </Button>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {!data && loading ? (
        <div className="card">
          <div className="card-body">
            <LoadingBlock rows={5} label="Đang tải điều phối" />
          </div>
        </div>
      ) : null}

      {data && kpis ? (
        <>
          <div className="kpi-grid kpi-grid-5">
            <StatCard
              label="Đang trong ca"
              value={kpis.active}
              sub={`${kpis.total} người có lịch hôm nay`}
              icon={UserCheck}
              tone="success"
            />
            <StatCard label="Chưa vào ca" value={kpis.notIn} sub="đã qua giờ bắt đầu" icon={UserX} tone="danger" />
            <StatCard label="Sắp vào ca" value={kpis.upcoming} sub="trong 6 giờ tới" icon={Clock3} tone="brand" />
            <StatCard label="Đi muộn" value={kpis.late} sub="có phút muộn được ghi nhận" icon={Timer} tone="warn" />
            <StatCard label="Ngoài vùng" value={kpis.outside} sub="cần xác nhận vị trí" icon={MapPin} tone="violet" />
          </div>

          <div className="dispatch-grid">
            <div className="card map-card">
              <div className="card-head" style={{ paddingBottom: 10 }}>
                <div>
                  <div className="card-title">
                    <MapPin size={15} />
                    Bản đồ vị trí chấm công
                  </div>
                  <div className="card-sub">
                    {data.pins.length} vị trí gần nhất · cập nhật {timeAgo(data.now)}
                  </div>
                </div>
                <div className="card-tools">
                  <Badge tone="success" dot>
                    {kpis.active} trong ca
                  </Badge>
                  {kpis.outside ? (
                    <Badge tone="warn" dot>
                      {kpis.outside} ngoài vùng
                    </Badge>
                  ) : null}
                </div>
              </div>
              <OfflineMap
                height={330}
                locations={data.locations}
                points={data.pins.map((p) => ({
                  id: p.employeeId,
                  lat: p.lat,
                  lng: p.lng,
                  name: p.name,
                  sub: `${STATUS[p.status].label}${p.at ? ` · ${clockLabel(p.at)}` : ''}`,
                  tone: pinTone(p.status),
                  selected: p.employeeId === selectedId,
                  onClick: () => setSelectedId(p.employeeId),
                }))}
              >
                <div className="map-hud">
                  <span className="map-loc-chip">
                    <Building2 size={12} />
                    {data.locations.length} địa điểm
                  </span>
                  <span className="map-loc-chip">
                    <Clock3 size={12} />
                    {clockLabel(data.now)}
                  </span>
                </div>
              </OfflineMap>
            </div>

            <div className="card">
              <div className="rail-head">
                <span className="rail-title">
                  <TriangleAlert size={14} />
                  Cần chú ý
                </span>
                <Badge tone={data.lateRows.length ? 'warn' : 'success'}>{data.lateRows.length}</Badge>
              </div>
              {data.lateRows.length ? (
                <div className="attention-list">
                  {data.lateRows.slice(0, 9).map((row) => (
                    <button
                      key={row.employee.id}
                      type="button"
                      className="attention-item"
                      onClick={() => setSelectedId(row.employee.id)}
                    >
                      <Avatar name={row.employee.name} size={30} toneKey={row.employee.id} />
                      <span className="attention-copy">
                        <span className="attention-name">{row.employee.name}</span>
                        <span className="attention-meta">
                          {STATUS[row.status].label}
                          {row.lateMinutes ? ` · muộn ${formatMinutes(row.lateMinutes)}` : ''}
                          {row.afterShiftMinutes ? ` · quá ${formatMinutes(row.afterShiftMinutes)}` : ''}
                        </span>
                      </span>
                      <span className="attention-time">
                        {row.lastAt ? clockLabel(row.lastAt) : row.shift ? row.shift.start : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={UserCheck}
                  title="Không có ai cần chú ý"
                  description="Mọi người đang trong ca hoặc đã hoàn tất đúng giờ."
                  compact
                />
              )}
              <div className="card-foot" style={{ borderTop: '1px solid var(--line-soft)' }}>
                <span className="muted" style={{ fontSize: 11 }}>
                  Tự cập nhật mỗi 45 giây
                </span>
                <Link to="/app/bang-cong" className="m-sec-link" style={{ color: 'var(--brand)', fontSize: 11.5 }}>
                  Xem bảng công
                </Link>
              </div>
            </div>
          </div>

          <div className="dispatch-body">
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Danh sách theo dõi</div>
                  <div className="card-sub">{filtered.length} nhân viên có lịch hoặc đã chấm công hôm nay</div>
                </div>
                <div className="card-tools">
                  <div className="toolbar-search" style={{ maxWidth: 190 }}>
                    <Search size={14} />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Tìm nhân viên…"
                      aria-label="Tìm nhân viên đang điều phối"
                    />
                  </div>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
                    <option value="all">Tất cả trạng thái</option>
                    {Object.entries(STATUS).map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="table-wrap dispatch-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Ca</th>
                      <th>Vào</th>
                      <th>Ra</th>
                      <th>Trạng thái</th>
                      <th>Vị trí</th>
                      <th>Ghi nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const meta = STATUS[row.status];
                      const inPunch = row.punches.find((p) => p.kind === 'in');
                      const outPunch = row.punches.find((p) => p.kind === 'out');
                      return (
                        <tr
                          key={row.employee.id}
                          onClick={() => setSelectedId(row.employee.id)}
                          className={row.employee.id === selectedId ? 'row-warn' : undefined}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <div className="cell-person">
                              <Avatar name={row.employee.name} size={30} toneKey={row.employee.id} />
                              <div className="cell-person-copy">
                                <div className="cell-person-name">{row.employee.name}</div>
                                <div className="cell-person-sub">
                                  {row.employee.code} · {row.employee.contract}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            {row.shift ? (
                              <>
                                <span className="badge badge-outline">{row.shift.code}</span>
                                <div className="cell-person-sub" style={{ marginTop: 2 }}>
                                  {row.shift.start}–{row.shift.end}
                                </div>
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="money">
                            {inPunch ? clockLabel(inPunch.at) : '—'}
                            {row.lateMinutes ? (
                              <div className="money-neg" style={{ fontSize: 10 }}>
                                +{row.lateMinutes}p
                              </div>
                            ) : null}
                          </td>
                          <td className="money">{outPunch ? clockLabel(outPunch.at) : '—'}</td>
                          <td>
                            <span className="status-cell">
                              <i style={{ background: meta.dot }} />
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            {row.location ? (
                              <span className="device-chip">
                                <MapPin size={12} />
                                {row.location.name}
                              </span>
                            ) : (
                              <span className="muted">Chưa có GPS</span>
                            )}
                          </td>
                          <td>
                            <Link
                              to={`/app/bang-cong?employee=${row.employee.id}&date=${data.today}`}
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--brand)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Chi tiết
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filtered.length ? (
                  <EmptyState
                    icon={Smartphone}
                    title="Không có nhân viên khớp bộ lọc"
                    description="Thử trạng thái khác hoặc xoá từ khoá tìm kiếm."
                    compact
                  />
                ) : null}
              </div>
            </div>

            <div className="card">
              <div className="rail-head">
                <span className="rail-title">
                  <Clock3 size={14} />
                  Dòng chấm công
                </span>
                <Badge tone="slate">{data.feed.length}</Badge>
              </div>
              <div className="feed-list">
                {data.feed.map((item) => (
                  <div className="feed-item" key={item.id}>
                    <span
                      className="m-row-icon"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: item.kind === 'in' ? 'var(--green-50)' : 'var(--red-50)',
                        color: item.kind === 'in' ? 'var(--green-600)' : 'var(--red)',
                      }}
                    >
                      {item.kind === 'in' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <div className="feed-main">
                      <div className="feed-line">
                        <span className="feed-name">{item.employeeName}</span>
                        <span className="muted" style={{ fontSize: 10.5 }}>
                          {item.kind === 'in' ? 'vào ca' : 'ra ca'}
                        </span>
                        {item.outside ? <Badge tone="warn">Ngoài vùng</Badge> : null}
                        {item.lateMinutes ? <Badge tone="danger">Muộn {item.lateMinutes}p</Badge> : null}
                      </div>
                      <div className="feed-meta">
                        <MapPin size={10} />
                        {item.location?.name ?? 'Không xác định'} · {dateLong(item.workDate)}
                        {item.distance !== undefined ? ` · ${item.distance} m` : ''}
                      </div>
                    </div>
                    {item.photo ? (
                      <img className="feed-photo" src={item.photo} alt={`Ảnh chấm công của ${item.employeeName}`} />
                    ) : null}
                    <span className="feed-time">{clockLabel(item.at)}</span>
                  </div>
                ))}
                {!data.feed.length ? (
                  <EmptyState
                    icon={Clock3}
                    title="Chưa có lượt chấm công"
                    description="Dòng thời gian sẽ xuất hiện khi nhân viên bấm chấm công."
                    compact
                  />
                ) : null}
              </div>
            </div>
          </div>

          {selected ? (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head is-bordered">
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={selected.employee.name} size={38} toneKey={selected.employee.id} />
                  <div>
                    <div className="card-title" style={{ marginBottom: 0 }}>
                      {selected.employee.name}
                      <Badge tone={STATUS[selected.status].tone}>{STATUS[selected.status].label}</Badge>
                    </div>
                    <div className="card-sub">
                      {selected.employee.code} · {selected.employee.contract} · ca{' '}
                      {selected.shift ? `${selected.shift.code} ${selected.shift.start}–${selected.shift.end}` : 'chưa xếp'}
                    </div>
                  </div>
                </div>
                <div className="card-tools">
                  <Link to={`/app/bang-cong?employee=${selected.employee.id}&date=${data.today}`}>
                    <Button size="sm">Mở bảng công</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                    Đóng
                  </Button>
                </div>
              </div>
              <div className="card-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220 }}>
                  <div className="drawer-section-title">Chấm công hôm nay</div>
                  {selected.punches.length ? (
                    selected.punches.map((p) => (
                      <div className="punch-line" key={p.id}>
                        <span className={`punch-kind punch-kind-${p.kind}`}>
                          {p.kind === 'in' ? 'VÀO' : 'RA'}
                        </span>
                        <span className="punch-time">{clockLabel(p.at)}</span>
                        {p.photo ? <img className="punch-photo" src={p.photo} alt="" /> : null}
                        <span className="punch-meta">
                          {p.distance !== undefined ? `${p.distance} m` : ''}
                          {p.outside ? ' · ngoài vùng' : ''}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted" style={{ fontSize: 12 }}>
                      Chưa có lượt chấm công nào.
                    </p>
                  )}
                </div>
                <div style={{ minWidth: 220 }}>
                  <div className="drawer-section-title">Vị trí gần nhất</div>
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    {selected.location?.name ?? 'Chưa xác định'}
                    <br />
                    {selected.lat !== undefined && selected.lng !== undefined
                      ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`
                      : 'Không có toạ độ'}
                  </div>
                </div>
                <div style={{ minWidth: 220 }}>
                  <div className="drawer-section-title">Công & OT tạm tính</div>
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    Công: <strong>{selected.day.cong}</strong>
                    <br />
                    Muộn: <strong>{formatMinutes(selected.day.lateMinutes)}</strong>
                    <br />
                    OT chờ duyệt: <strong>{formatMinutes(selected.day.pendingOtMinutes)}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
