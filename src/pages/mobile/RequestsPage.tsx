import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock3,
  FileQuestion,
  FileText,
  MessageSquare,
  Plus,
  Timer,
} from 'lucide-react';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Select,
  Sheet,
  Textarea,
  type BadgeTone,
} from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/session';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  addDays,
  dateLong,
  dateShort,
  eachDate,
  formatMinutes,
  hmToMinutes,
  leaveTypeLabel,
  minutesToHm,
  requestDuration,
  requestSummary,
  timeAgo,
  todayIct,
} from '../../lib/format';
import type {
  Request,
  RequestPayload,
  RequestStatus,
  RequestType,
  ScheduleData,
} from '../../lib/types';

type Filter = 'all' | RequestStatus;

const TYPES: { type: RequestType; label: string; icon: typeof CalendarDays }[] = [
  { type: 'leave', label: 'Nghỉ phép', icon: CalendarDays },
  { type: 'late_early', label: 'Đi muộn', icon: Clock3 },
  { type: 'ot', label: 'Làm thêm', icon: Timer },
  { type: 'swap', label: 'Đổi ca', icon: ArrowLeftRight },
  { type: 'register', label: 'Đăng ký ca', icon: CalendarPlus },
  { type: 'forgot', label: 'Quên chấm', icon: FileQuestion },
  { type: 'explain', label: 'Giải trình', icon: MessageSquare },
];

const TYPE_TONE: Record<RequestType, BadgeTone> = {
  leave: 'sky',
  late_early: 'warn',
  ot: 'violet',
  swap: 'brand',
  register: 'success',
  forgot: 'danger',
  explain: 'slate',
};

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  pending: 'warn',
  approved: 'success',
  rejected: 'danger',
};

function typeIcon(type: RequestType) {
  const found = TYPES.find((t) => t.type === type);
  const Icon = found?.icon ?? FileText;
  return <Icon size={16} />;
}

function parseType(value: string | null): RequestType | null {
  return TYPES.some((t) => t.type === value) ? (value as RequestType) : null;
}

export default function RequestsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Request | null>(null);
  const [composer, setComposer] = useState<RequestType | null>(() => parseType(params.get('type')));
  const today = todayIct();

  const { data, error, loading, reload } = useAsync<{
    requests: Request[];
    schedule: ScheduleData;
  }>(async () => {
    const [requests, schedule] = await Promise.all([
      api.get<{ requests: Request[] }>('/api/me/requests'),
      api.get<ScheduleData>(`/api/me/schedule?from=${today}&to=${addDays(today, 21)}`),
    ]);
    return { requests: requests.requests, schedule };
  }, []);

  useEffect(() => {
    const next = parseType(params.get('type'));
    if (next) setComposer(next);
  }, [params]);

  const closeComposer = () => {
    setComposer(null);
    if (params.has('type')) {
      const next = new URLSearchParams(params);
      next.delete('type');
      setParams(next, { replace: true });
    }
  };

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
        <ErrorState message={error ?? 'Không tải được danh sách đơn.'} onRetry={() => reload()} />
      </div>
    );
  }

  const counts = {
    pending: data.requests.filter((r) => r.status === 'pending').length,
    approved: data.requests.filter((r) => r.status === 'approved').length,
    rejected: data.requests.filter((r) => r.status === 'rejected').length,
  };
  const visible = filter === 'all' ? data.requests : data.requests.filter((r) => r.status === filter);

  return (
    <div className="m-page m-page-tight">
      <div className="m-between">
        <div>
          <div className="m-strong" style={{ fontSize: 13 }}>Đơn của tôi</div>
          <div className="m-caption">{data.requests.length} đơn · {counts.pending} chờ duyệt</div>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setComposer('leave')}>
          Tạo đơn
        </Button>
      </div>

      <div className="m-tabs-scroll">
        {([
          ['all', 'Tất cả', data.requests.length],
          ['pending', 'Chờ duyệt', counts.pending],
          ['approved', 'Đã duyệt', counts.approved],
          ['rejected', 'Từ chối', counts.rejected],
        ] as [Filter, string, number][]).map(([value, label, count]) => (
          <button
            type="button"
            key={value}
            className={`m-filter ${filter === value ? 'active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {visible.length ? (
        <div className="m-req-list">
          {visible.map((req) => (
            <button type="button" className="m-req" key={req.id} onClick={() => setSelected(req)}>
              <span className={`m-row-icon t-${requestTone(req.type)}`}>{typeIcon(req.type)}</span>
              <div className="m-req-body">
                <div className="m-req-top">
                  <div className="m-req-title">{REQUEST_TYPE_LABEL[req.type]}</div>
                  <Badge tone={STATUS_TONE[req.status]}>{REQUEST_STATUS_LABEL[req.status]}</Badge>
                </div>
                <div className="m-req-sum">{requestSummary(req)}</div>
                <div className="m-req-meta">
                  <span>{timeAgo(req.createdAt)}</span>
                  {req.decisionNote ? <span>· Đã phản hồi</span> : null}
                </div>
              </div>
              <ChevronRight size={16} className="m-row-chevron" />
            </button>
          ))}
        </div>
      ) : (
        <div className="m-card">
          <div className="m-empty">
            <FileText size={22} />
            <div>{filter === 'all' ? 'Bạn chưa gửi đơn nào.' : 'Không có đơn ở trạng thái này.'}</div>
          </div>
        </div>
      )}

      <div className="m-banner info">
        <FileText size={15} />
        <span>
          Đơn nghỉ phép cần gửi trước ngày nghỉ. Đơn quên chấm công chỉ áp dụng trong vòng 30 ngày gần nhất.
        </span>
      </div>

      {selected ? (
        <RequestDetail
          request={selected}
          schedule={data.schedule}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {composer ? (
        <ComposerSheet
          initialType={composer}
          schedule={data.schedule}
          today={today}
          onClose={closeComposer}
          onCreated={async () => {
            closeComposer();
            setFilter('pending');
            await reload(true);
          }}
        />
      ) : null}
    </div>
  );
}

function requestTone(type: RequestType): string {
  return type === 'leave'
    ? 'sky'
    : type === 'late_early'
      ? 'amber'
      : type === 'ot'
        ? 'violet'
        : type === 'register'
          ? 'green'
          : type === 'forgot'
            ? 'red'
            : 'blue';
}

function RequestDetail({
  request,
  schedule,
  onClose,
}: {
  request: Request;
  schedule: ScheduleData;
  onClose: () => void;
}) {
  const shiftName = (id?: string) => {
    const shift = schedule.shifts.find((s) => s.id === id);
    return shift ? `${shift.code} · ${shift.name}` : '—';
  };
  const p = request.payload;
  const rows: { label: string; value: string }[] = [];

  if (p.kind === 'leave') {
    rows.push(
      { label: 'Loại nghỉ', value: leaveTypeLabel(p.leaveType) },
      { label: 'Từ ngày', value: dateLong(p.from) },
      { label: 'Đến ngày', value: dateLong(p.to) },
      { label: 'Số ngày', value: `${eachDate(p.from, p.to).length} ngày` },
    );
  } else if (p.kind === 'late_early') {
    rows.push(
      { label: 'Hình thức', value: p.mode === 'late' ? 'Đi muộn' : 'Về sớm' },
      { label: 'Ngày', value: dateLong(p.date) },
      { label: 'Số phút', value: `${p.minutes} phút` },
    );
    if (p.shiftId) rows.push({ label: 'Ca', value: shiftName(p.shiftId) });
  } else if (p.kind === 'ot') {
    rows.push(
      { label: 'Ngày', value: dateLong(p.date) },
      { label: 'Ca', value: shiftName(p.shiftId) },
      { label: 'Thời gian', value: `${p.from} – ${p.to}` },
      { label: 'Thời lượng', value: formatMinutes(requestDuration(request)) },
    );
  } else if (p.kind === 'swap') {
    rows.push(
      { label: 'Ngày nghỉ', value: `${dateShort(p.fromDate)} · ${shiftName(p.fromShiftId)}` },
      { label: 'Ngày đi làm bù', value: `${dateShort(p.toDate)} · ${shiftName(p.toShiftId)}` },
    );
  } else if (p.kind === 'register') {
    rows.push({
      label: 'Các ca đăng ký',
      value: p.dates
        .map((d) => `${dateShort(d.date)} (${schedule.shifts.find((s) => s.id === d.shiftId)?.code ?? '—'})`)
        .join(', '),
    });
  } else if (p.kind === 'forgot') {
    rows.push(
      { label: 'Ngày', value: dateLong(p.date) },
      { label: 'Ca', value: shiftName(p.shiftId) },
      { label: 'Giờ vào báo', value: p.inTime || '—' },
      { label: 'Giờ ra báo', value: p.outTime || '—' },
    );
  } else {
    rows.push({ label: 'Ngày', value: dateLong(p.date) });
    if (p.shiftId) rows.push({ label: 'Ca', value: shiftName(p.shiftId) });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={REQUEST_TYPE_LABEL[request.type]}
      description={`Gửi ${timeAgo(request.createdAt)}`}
    >
      <div className="m-detail-head">
        <span className={`m-detail-icon m-row-icon t-${requestTone(request.type)}`}>
          {typeIcon(request.type)}
        </span>
        <div className="m-grow">
          <h3>{requestSummary(request)}</h3>
          <p>{new Date(request.createdAt).toLocaleString('vi-VN')}</p>
        </div>
        <Badge tone={STATUS_TONE[request.status]}>{REQUEST_STATUS_LABEL[request.status]}</Badge>
      </div>

      <div className="m-day-rows">
        {rows.map((row) => (
          <div className="m-day-row" key={row.label}>
            <span>{row.label}</span>
            <b>{row.value}</b>
          </div>
        ))}
        <div className="m-day-row">
          <span>Trạng thái</span>
          <b>{REQUEST_STATUS_LABEL[request.status]}</b>
        </div>
        {request.decidedAt ? (
          <div className="m-day-row">
            <span>Xử lý lúc</span>
            <b>{new Date(request.decidedAt).toLocaleString('vi-VN')}</b>
          </div>
        ) : null}
      </div>

      <div className="m-detail-note">
        <b>Lý do:</b> {'reason' in p ? p.reason : '—'}
      </div>

      {request.decisionNote ? (
        <div className={`m-banner ${request.status === 'approved' ? 'success' : 'danger'}`} style={{ marginTop: 12 }}>
          <MessageSquare size={15} />
          <div>
            <b>Phản hồi từ quản lý</b>
            <div>{request.decisionNote}</div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function ComposerSheet({
  initialType,
  schedule,
  today,
  onClose,
  onCreated,
}: {
  initialType: RequestType;
  schedule: ScheduleData;
  today: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();
  const { me } = useAuth();
  const [type, setType] = useState<RequestType>(initialType);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shifts = useMemo(() => {
    const owned = schedule.shifts.filter((s) => me?.position.shiftIds.includes(s.id));
    return owned.length ? owned : schedule.shifts;
  }, [schedule.shifts, me?.position.shiftIds]);
  const defaultShiftId = useMemo(() => {
    const todayShift = schedule.schedules.find((s) => s.date === today)?.shiftId;
    return shifts.find((s) => s.id === todayShift)?.id ?? shifts[0]?.id ?? '';
  }, [schedule.schedules, shifts, today]);
  const defaultShift = shifts.find((s) => s.id === defaultShiftId);

  const [leaveType, setLeaveType] = useState<'annual' | 'sick' | 'unpaid'>('annual');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<'late' | 'early'>('late');
  const [minutes, setMinutes] = useState('30');
  const [shiftId, setShiftId] = useState(defaultShiftId);
  const [otFrom, setOtFrom] = useState(defaultShift ? defaultShift.end : '18:00');
  const [otTo, setOtTo] = useState(
    defaultShift ? minutesToHm(hmToMinutes(defaultShift.end) + 120) : '20:00',
  );
  const [swapFromDate, setSwapFromDate] = useState(today);
  const [swapFromShift, setSwapFromShift] = useState(defaultShiftId);
  const [swapToDate, setSwapToDate] = useState(addDays(today, 1));
  const [swapToShift, setSwapToShift] = useState(defaultShiftId);
  const [registerDates, setRegisterDates] = useState<Set<string>>(() => new Set());
  const [registerShift, setRegisterShift] = useState(defaultShiftId);
  const [forgotDate, setForgotDate] = useState(today);
  const [forgotShift, setForgotShift] = useState(defaultShiftId);
  const [forgotIn, setForgotIn] = useState('');
  const [forgotOut, setForgotOut] = useState('');
  const [explainDate, setExplainDate] = useState(today);
  const [explainShift, setExplainShift] = useState('');

  const dates = eachDate(today, addDays(today, 20));

  const changeType = (next: RequestType) => {
    setType(next);
    setReason('');
    setError(null);
  };

  const changeOtShift = (id: string) => {
    setShiftId(id);
    const shift = shifts.find((s) => s.id === id);
    if (shift) {
      setOtFrom(shift.end);
      setOtTo(minutesToHm(hmToMinutes(shift.end) + 120));
    }
  };

  const toggleRegisterDate = (date: string) => {
    setRegisterDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const buildPayload = (): RequestPayload => {
    const cleanReason = reason.trim();
    switch (type) {
      case 'leave':
        return { kind: 'leave', leaveType, from, to, reason: cleanReason };
      case 'late_early':
        return {
          kind: 'late_early',
          mode,
          date: from,
          minutes: Number(minutes),
          shiftId: shiftId || undefined,
          reason: cleanReason,
        };
      case 'ot':
        return { kind: 'ot', date: from, shiftId, from: otFrom, to: otTo, reason: cleanReason };
      case 'swap':
        return {
          kind: 'swap',
          fromDate: swapFromDate,
          fromShiftId: swapFromShift,
          toDate: swapToDate,
          toShiftId: swapToShift,
          reason: cleanReason,
        };
      case 'register':
        return {
          kind: 'register',
          dates: [...registerDates].sort().map((date) => ({ date, shiftId: registerShift })),
          reason: cleanReason,
        };
      case 'forgot':
        return {
          kind: 'forgot',
          date: forgotDate,
          shiftId: forgotShift,
          inTime: forgotIn || undefined,
          outTime: forgotOut || undefined,
          reason: cleanReason,
        };
      case 'explain':
        return {
          kind: 'explain',
          date: explainDate,
          shiftId: explainShift || undefined,
          reason: cleanReason,
        };
    }
  };

  const validate = (): string | null => {
    if (reason.trim().length < 5) return 'Vui lòng nhập lý do (ít nhất 5 ký tự).';
    if (type === 'leave') {
      if (from > to) return 'Ngày bắt đầu phải trước ngày kết thúc.';
      if (eachDate(from, to).length > 60) return 'Đơn nghỉ tối đa 60 ngày.';
    }
    if (type === 'late_early') {
      const value = Number(minutes);
      if (!Number.isFinite(value) || value < 1 || value > 480) return 'Số phút phải trong khoảng 1–480.';
    }
    if (type === 'ot') {
      if (!shiftId) return 'Vui lòng chọn ca làm thêm.';
      if (otFrom === otTo) return 'Giờ bắt đầu và kết thúc không được trùng nhau.';
    }
    if (type === 'swap') {
      if (swapFromDate === swapToDate && swapFromShift === swapToShift) {
        return 'Ca đổi không có gì thay đổi.';
      }
    }
    if (type === 'register') {
      if (!registerDates.size) return 'Chọn ít nhất một ngày đăng ký.';
      if (!registerShift) return 'Vui lòng chọn ca.';
    }
    if (type === 'forgot') {
      if (!forgotShift) return 'Vui lòng chọn ca.';
      if (!forgotIn && !forgotOut) return 'Nhập ít nhất một mốc giờ bị quên.';
      if (forgotIn && forgotOut && forgotIn >= forgotOut) return 'Giờ ra phải sau giờ vào.';
    }
    return null;
  };

  const submit = async () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/me/requests', { type, payload: buildPayload() });
      toast.success('Đã gửi đơn. Quản lý sẽ xử lý trong thời gian sớm nhất.');
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const shiftOptions = shifts.map((s) => (
    <option key={s.id} value={s.id}>
      {s.code} · {s.name} ({s.start}–{s.end})
    </option>
  ));

  const noShift = !shifts.length;

  return (
    <Sheet
      open
      onClose={onClose}
      full
      title="Tạo đơn từ"
      description="Chọn loại đơn và điền thông tin cần thiết"
      footer={
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={onClose} disabled={busy} style={{ flex: 1 }}>
            Huỷ
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} style={{ flex: 1 }}>
            Gửi đơn
          </Button>
        </div>
      }
    >
      <div className="m-form">
        <div className="m-chip-grid">
          {TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.type}
                className={`m-choice ${type === item.type ? 'active' : ''}`}
                onClick={() => changeType(item.type)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </div>

        {noShift && type !== 'leave' && type !== 'explain' ? (
          <div className="m-banner warn">
            <AlertTriangle size={15} />
            <span>Vị trí của bạn chưa được gán ca làm việc. Liên hệ quản lý trước khi gửi đơn.</span>
          </div>
        ) : null}

        {type === 'leave' ? (
          <>
            <Field label="Loại nghỉ">
              <div className="m-seg">
                {([
                  ['annual', 'Phép năm'],
                  ['sick', 'Nghỉ ốm'],
                  ['unpaid', 'Không lương'],
                ] as const).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={leaveType === value ? 'active' : ''}
                    onClick={() => setLeaveType(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="m-form-row">
              <Field label="Từ ngày" required>
                <Input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Đến ngày" required>
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <div className="m-form-hint">Phép năm còn lại được kiểm tra tự động khi bạn gửi đơn.</div>
          </>
        ) : null}

        {type === 'late_early' ? (
          <>
            <Field label="Hình thức">
              <div className="m-seg">
                <button type="button" className={mode === 'late' ? 'active' : ''} onClick={() => setMode('late')}>
                  Đi muộn
                </button>
                <button type="button" className={mode === 'early' ? 'active' : ''} onClick={() => setMode('early')}>
                  Về sớm
                </button>
              </div>
            </Field>
            <div className="m-form-row">
              <Field label="Ngày" required>
                <Input type="date" value={from} min={addDays(today, -7)} max={addDays(today, 30)} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Số phút" required>
                <Input type="number" min={1} max={480} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </Field>
            </div>
            <Field label="Ca làm">
              <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">Không chọn ca</option>
                {shiftOptions}
              </Select>
            </Field>
          </>
        ) : null}

        {type === 'ot' ? (
          <>
            <div className="m-form-row">
              <Field label="Ngày làm thêm" required>
                <Input type="date" value={from} min={addDays(today, -1)} max={addDays(today, 30)} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Ca" required>
                <Select value={shiftId} onChange={(e) => changeOtShift(e.target.value)}>
                  {shiftOptions}
                </Select>
              </Field>
            </div>
            <div className="m-form-row">
              <Field label="Từ giờ" required>
                <Input type="time" value={otFrom} onChange={(e) => setOtFrom(e.target.value)} />
              </Field>
              <Field label="Đến giờ" required>
                <Input type="time" value={otTo} onChange={(e) => setOtTo(e.target.value)} />
              </Field>
            </div>
            {otFrom && otTo ? (
              <div className="m-form-hint">
                Thời lượng dự kiến:{' '}
                {formatMinutes(
                  hmToMinutes(otTo) > hmToMinutes(otFrom)
                    ? hmToMinutes(otTo) - hmToMinutes(otFrom)
                    : hmToMinutes(otTo) + 1440 - hmToMinutes(otFrom),
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {type === 'swap' ? (
          <>
            <Field label="Ca bạn sẽ nghỉ">
              <div className="m-form-row">
                <Input type="date" value={swapFromDate} min={today} onChange={(e) => setSwapFromDate(e.target.value)} />
                <Select value={swapFromShift} onChange={(e) => setSwapFromShift(e.target.value)}>
                  {shiftOptions}
                </Select>
              </div>
            </Field>
            <Field label="Ca bạn sẽ đi làm bù">
              <div className="m-form-row">
                <Input type="date" value={swapToDate} min={today} onChange={(e) => setSwapToDate(e.target.value)} />
                <Select value={swapToShift} onChange={(e) => setSwapToShift(e.target.value)}>
                  {shiftOptions}
                </Select>
              </div>
            </Field>
          </>
        ) : null}

        {type === 'register' ? (
          <>
            <Field label="Ca đăng ký" required hint="Ca phải thuộc vị trí công việc của bạn.">
              <Select value={registerShift} onChange={(e) => setRegisterShift(e.target.value)}>
                {shiftOptions}
              </Select>
            </Field>
            <Field label={`Ngày đăng ký (${registerDates.size} đã chọn)`} required>
              <div className="m-inline m-wrap" style={{ gap: 6 }}>
                {dates.map((date) => (
                  <button
                    type="button"
                    key={date}
                    className={`m-filter ${registerDates.has(date) ? 'active' : ''}`}
                    onClick={() => toggleRegisterDate(date)}
                  >
                    {dateShort(date)}
                  </button>
                ))}
              </div>
              <div className="m-form-hint">Có thể chọn tối đa 21 ngày trong vòng 3 tuần tới.</div>
            </Field>
          </>
        ) : null}

        {type === 'forgot' ? (
          <>
            <div className="m-form-row">
              <Field label="Ngày quên" required>
                <Input type="date" value={forgotDate} max={today} min={addDays(today, -30)} onChange={(e) => setForgotDate(e.target.value)} />
              </Field>
              <Field label="Ca" required>
                <Select value={forgotShift} onChange={(e) => setForgotShift(e.target.value)}>
                  {shiftOptions}
                </Select>
              </Field>
            </div>
            <div className="m-form-row">
              <Field label="Giờ vào">
                <Input type="time" value={forgotIn} onChange={(e) => setForgotIn(e.target.value)} />
              </Field>
              <Field label="Giờ ra">
                <Input type="time" value={forgotOut} onChange={(e) => setForgotOut(e.target.value)} />
              </Field>
            </div>
            <div className="m-form-hint">Chỉ nhập mốc giờ hệ thống chưa ghi nhận. Không cần nhập cả hai nếu chỉ quên một lần.</div>
          </>
        ) : null}

        {type === 'explain' ? (
          <>
            <div className="m-form-row">
              <Field label="Ngày cần giải trình" required>
                <Input type="date" value={explainDate} max={today} min={addDays(today, -30)} onChange={(e) => setExplainDate(e.target.value)} />
              </Field>
              <Field label="Ca (không bắt buộc)">
                <Select value={explainShift} onChange={(e) => setExplainShift(e.target.value)}>
                  <option value="">Không chọn ca</option>
                  {shiftOptions}
                </Select>
              </Field>
            </div>
          </>
        ) : null}

        <Field label="Lý do" required hint="Mô tả ngắn gọn để quản lý có thể xử lý nhanh.">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: con ốm nên về sớm sau khi hoàn thành ca"
          />
        </Field>

        {error ? (
          <div className="m-banner danger">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
