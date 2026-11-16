import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  FileText,
  Fingerprint,
  MapPin,
  RefreshCw,
  Table2,
  TabletSmartphone,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  LoadingBlock,
  Sheet,
  Textarea,
} from '../../components/ui';
import { useAsync, useNow } from '../../lib/hooks';
import { api, errorText } from '../../lib/api';
import { useToast } from '../../lib/toast';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  dateLong,
  fmtNumber,
  formatMinutes,
  ictParts,
  partyTime,
  requestSummary,
  timeAgo,
} from '../../lib/format';
import type { EmployeeHomeData, PunchResponse } from '../../lib/types';

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

function drawJpeg(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, 640 / Math.max(width, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function fileToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(drawJpeg(img, img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh.'));
    };
    img.src = url;
  });
}

function requestTone(type: string): string {
  if (type === 'leave') return 'sky';
  if (type === 'ot') return 'violet';
  if (type === 'late_early') return 'amber';
  if (type === 'forgot') return 'red';
  if (type === 'register') return 'green';
  return 'blue';
}

export default function HomePage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const now = useNow(1000);
  const { data, error, loading, reload } = useAsync<EmployeeHomeData>(
    () => api.get('/api/me/home'),
    [],
  );

  const [punchOpen, setPunchOpen] = useState(() => params.get('punch') === '1');

  useEffect(() => {
    if (params.get('punch') === '1') setPunchOpen(true);
  }, [params]);

  const closePunch = () => {
    setPunchOpen(false);
    const next = new URLSearchParams(params);
    next.delete('punch');
    setParams(next, { replace: true });
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
        <ErrorState message={error ?? 'Không tải được dữ liệu.'} onRetry={() => reload()} />
      </div>
    );
  }

  const { day, shift, employee, month, punches } = data;
  const clock = ictParts(now).time.slice(0, 5);
  const inPunch = punches.find((p) => p.kind === 'in');
  const outPunch = punches.find((p) => p.kind === 'out');
  const last = data.lastPunch;
  const disabled =
    !shift || data.punchState === 'done' || data.punchState === 'leave';
  const punchTitle =
    data.punchState === 'done'
      ? 'Đã đủ công'
      : data.punchState === 'leave'
        ? 'Nghỉ phép'
        : !shift
          ? 'Hôm nay nghỉ'
          : data.punchState === 'in'
            ? 'Chấm ra'
            : 'Chấm vào';
  const punchHint =
    data.punchState === 'done'
      ? 'Xong'
      : data.punchState === 'leave'
        ? 'Đã duyệt'
        : !shift
          ? 'Không có ca'
          : data.punchState === 'in'
            ? 'Kết thúc ca'
            : 'Bắt đầu ca';

  return (
    <div className="m-page">
      <section className="m-hero">
        <div className="m-hero-top">
          <div>
            <div className="m-hero-hello">Xin chào,</div>
            <div className="m-hero-name">{employee.name}</div>
            <div className="m-hero-date">{dateLong(data.today)}</div>
          </div>
          <div className="m-hero-live">
            <i />
            {clock}
          </div>
        </div>

        {shift ? (
          <div className="m-hero-shift">
            <span className="m-hero-shift-code">{shift.code}</span>
            <span className="m-hero-shift-name">{shift.name}</span>
            <span className="m-hero-shift-time">{shift.timeLabel}</span>
          </div>
        ) : (
          <div className="m-hero-shift">
            <CalendarDays size={15} style={{ color: 'rgba(255,255,255,0.7)' }} />
            <span className="m-hero-shift-name">Hôm nay không có ca làm việc</span>
          </div>
        )}

        <div className="m-punch-wrap">
          <button
            type="button"
            className={`m-punch ${data.punchState === 'done' ? 'is-done' : ''} ${
              data.punchState === 'leave' ? 'is-leave' : ''
            }`}
            disabled={disabled}
            onClick={() => setPunchOpen(true)}
          >
            <span className="m-punch-inner">
              {data.punchState === 'done' ? <CheckCircle2 size={22} /> : <Fingerprint size={22} />}
              <strong>{punchTitle}</strong>
              <span>{punchHint}</span>
            </span>
          </button>
          <div className="m-punch-side">
            <div className="m-punch-line">
              <b>{inPunch ? partyTime(inPunch.at) : '--:--'}</b>
              <span>vào ca</span>
            </div>
            <div className="m-punch-line">
              <b>{outPunch ? partyTime(outPunch.at) : '--:--'}</b>
              <span>ra ca</span>
            </div>
            {last?.locationId ? (
              <div className="m-punch-loc">
                <MapPin size={12} />
                {last.distance !== undefined ? `Cách ${last.distance} m` : 'Đã xác định vị trí'}
              </div>
            ) : (
              <div className="m-punch-note">
                {data.requirePhoto
                  ? 'Công ty yêu cầu ảnh khi chấm công.'
                  : 'Chấm công khi bạn đang ở trong phạm vi cho phép.'}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="m-kpis">
        <div className="m-kpi">
          <div className="m-kpi-label">Công tháng</div>
          <div className="m-kpi-value">
            {fmtNumber(month.cong)}
            <small>/{fmtNumber(data.position.standardDays)}</small>
          </div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Đi muộn</div>
          <div className="m-kpi-value">
            {month.lateDays}
            <small>lần</small>
          </div>
        </div>
        <div className="m-kpi">
          <div className="m-kpi-label">Tăng ca</div>
          <div className="m-kpi-value">{formatMinutes(month.otMinutes)}</div>
        </div>
      </div>

      <div className="m-quick">
        <Link to="/m/bang-cong" className="m-quick-tile">
          <span className="m-quick-icon t-green"><Table2 size={17} /></span>
          Bảng công
        </Link>
        <Link to="/m/don" className="m-quick-tile">
          <span className="m-quick-icon t-blue"><FileText size={17} /></span>
          Đơn từ
        </Link>
        <Link to="/m/lich" className="m-quick-tile">
          <span className="m-quick-icon t-amber"><CalendarDays size={17} /></span>
          Lịch ca
        </Link>
        <Link to="/m/luong" className="m-quick-tile">
          <span className="m-quick-icon t-violet"><Wallet size={17} /></span>
          Phiếu lương
        </Link>
      </div>

      {data.requirePhoto ? (
        <div className="m-banner info">
          <Camera size={15} />
          <span>Công ty đang bật ảnh chấm công. Bạn cần chụp ảnh mỗi lần chấm.</span>
        </div>
      ) : null}

      <section className="m-sec">
        <div className="m-sec-head">
          <div className="m-sec-title">
            Hôm nay <span>{day.status === 'ok' ? 'Đủ công' : day.status === 'late' ? 'Đi muộn' : day.status === 'inprogress' ? 'Đang trong ca' : ''}</span>
          </div>
          <Badge tone={day.status === 'ok' ? 'success' : day.status === 'late' ? 'warn' : 'slate'}>
            {day.status === 'future' ? 'Chưa tới' : day.status === 'off' ? 'Nghỉ' : day.status === 'holiday' ? 'Ngày lễ' : day.status === 'leave' ? 'Nghỉ phép' : day.status === 'missing' ? 'Thiếu công' : day.status === 'absent' ? 'Vắng' : day.status === 'late' ? 'Đi muộn' : day.status === 'inprogress' ? 'Trong ca' : 'Đủ công'}
          </Badge>
        </div>
        {punches.length ? (
          <div className="m-card">
            <div className="m-timeline">
              {[...punches]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((p) => (
                  <div className="m-tl-item" key={p.id}>
                    <div className="m-tl-time">{partyTime(p.at)}</div>
                    <div className="m-tl-rail">
                      <span className={`m-tl-dot ${p.kind}`} />
                    </div>
                    <div className="m-tl-body">
                      <div className="m-tl-title">
                        Chấm công {p.kind === 'in' ? 'vào ca' : 'ra ca'}
                        {p.outside ? ' · ngoài phạm vi' : ''}
                      </div>
                      <div className="m-tl-sub">
                        {p.photo ? 'Có ảnh xác thực' : 'Không ảnh'}
                        {p.distance !== undefined ? ` · cách ${p.distance} m` : ''}
                        {p.note ? ` · ${p.note}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="m-card">
            <div className="m-empty" style={{ padding: '18px 8px' }}>
              <Clock3 size={22} />
              <div>{shift ? 'Chưa có lượt chấm công nào hôm nay.' : 'Hôm nay bạn được nghỉ.'}</div>
            </div>
          </div>
        )}
      </section>

      {data.pendingRequests.length ? (
        <section className="m-sec">
          <div className="m-sec-head">
            <div className="m-sec-title">
              Đơn chờ duyệt <span>{data.pendingRequests.length}</span>
            </div>
            <Link className="m-sec-link" to="/m/don">
              Xem tất cả <ArrowRight size={13} />
            </Link>
          </div>
          <div className="m-req-list">
            {data.pendingRequests.slice(0, 3).map((r) => (
              <Link to="/m/don" className="m-req" key={r.id}>
                <span className={`m-row-icon t-${requestTone(r.type)}`}>
                  <FileText size={16} />
                </span>
                <div className="m-req-body">
                  <div className="m-req-top">
                    <div className="m-req-title">{REQUEST_TYPE_LABEL[r.type]}</div>
                    <Badge tone="warn">{REQUEST_STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <div className="m-req-sum">{requestSummary(r)}</div>
                  <div className="m-req-meta">{timeAgo(r.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {data.notifications.length ? (
        <section className="m-sec">
          <div className="m-sec-head">
            <div className="m-sec-title">Thông báo</div>
            <Link className="m-sec-link" to="/m/thong-bao">
              Tất cả <ArrowRight size={13} />
            </Link>
          </div>
          <div className="m-list">
            {data.notifications.slice(0, 3).map((n) => (
              <Link to={n.link || '/m/thong-bao'} className="m-row" key={n.id}>
                <span className={`m-row-icon t-${n.kind === 'payslip' ? 'green' : n.kind === 'request' ? 'blue' : 'violet'}`}>
                  {n.kind === 'payslip' ? <Wallet size={16} /> : n.kind === 'request' ? <FileText size={16} /> : <Bell size={16} />}
                </span>
                <div className="m-row-body">
                  <div className="m-row-title">
                    {n.title}
                    {n.read ? null : <span className="m-unread-dot" />}
                  </div>
                  <div className="m-row-sub">{n.body}</div>
                </div>
                <span className="m-row-side">{timeAgo(n.at)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {data.upcoming.scheduled ? (
        <section className="m-sec">
          <div className="m-sec-head">
            <div className="m-sec-title">Ngày mai</div>
            <Link className="m-sec-link" to="/m/lich">
              Lịch ca <ArrowRight size={13} />
            </Link>
          </div>
          <div className="m-shift-card">
            <span className="m-shift-code t-blue">{data.upcoming.shiftCode ?? '—'}</span>
            <div className="m-shift-body">
              <div className="m-shift-name">{data.upcoming.shiftName}</div>
              <div className="m-shift-time">{data.upcoming.shiftTime}</div>
            </div>
            <span className="m-shift-state">Ngày mai</span>
          </div>
        </section>
      ) : null}

      <PunchScheduleSheet
        open={punchOpen}
        onClose={closePunch}
        home={data}
        onDone={async (message) => {
          toast.success(message);
          await reload(true);
        }}
      />
    </div>
  );
}

function PunchScheduleSheet({
  open,
  onClose,
  home,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  home: EmployeeHomeData;
  onDone: (message: string) => Promise<void>;
}) {
  const toast = useToast();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [camState, setCamState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const locate = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Thiết bị không hỗ trợ định vị.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy ?? 0),
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí cho trình duyệt.'
            : 'Không lấy được vị trí hiện tại. Kiểm tra GPS và thử lại.',
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  };

  useEffect(() => {
    if (!open) return;
    setPhoto(null);
    setNote('');
    setServerError(null);
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !home.requirePhoto) {
      setCamState('idle');
      return;
    }
    let cancelled = false;
    setCamState('loading');
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        setCamState('ready');
      })
      .catch(() => {
        if (!cancelled) setCamState('error');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, home.requirePhoto, facing]);

  useEffect(() => {
    if (!open) return;
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error('Camera chưa sẵn sàng.');
      return;
    }
    setPhoto(drawJpeg(video, video.videoWidth, video.videoHeight));
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await fileToJpeg(file));
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const submit = async () => {
    if (!coords) {
      toast.error('Chưa xác định được vị trí. Hãy bật định vị và thử lại.');
      return;
    }
    if (home.requirePhoto && !photo) {
      toast.error('Vui lòng chụp ảnh chấm công.');
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const result = await api.post<PunchResponse>('/api/me/punch', {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: coords.accuracy,
        note,
        photo: photo ?? undefined,
      });
      onClose();
      await onDone(result.message);
    } catch (err) {
      setServerError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const label =
    home.punchState === 'in' ? 'Xác nhận chấm ra' : 'Xác nhận chấm vào';
  const locationNames = home.locations.map((l) => l.name).join(', ');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={label}
      description={`${home.shift ? `${home.shift.code} · ${home.shift.timeLabel}` : 'Không có ca hôm nay'} · ${home.employee.name}`}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <Button onClick={onClose} disabled={busy} style={{ flex: 1 }}>
            Huỷ
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} style={{ flex: 1 }}>
            {label}
          </Button>
        </div>
      }
    >
      <div className="m-form">
        {home.requirePhoto ? (
          <Field label="Ảnh chấm công" required>
            {photo ? (
              <div className="stack" style={{ gap: 8 }}>
                <img src={photo} alt="Ảnh chấm công" className="m-cam-preview" />
                <div className="row">
                  <Button size="sm" icon={Camera} onClick={() => setPhoto(null)}>Chụp lại</Button>
                </div>
              </div>
            ) : (
              <div className="m-cam">
                <video ref={videoRef} playsInline muted />
                {camState !== 'ready' ? (
                  <div className="m-cam-off" style={{ position: 'absolute' }}>
                    {camState === 'loading'
                      ? 'Đang mở camera…'
                      : camState === 'error'
                        ? 'Không mở được camera. Bạn có thể chọn ảnh từ thiết bị.'
                        : 'Camera chưa sẵn sàng.'}
                  </div>
                ) : null}
                <div className="m-cam-actions">
                  <button
                    type="button"
                    className="m-cam-toggle"
                    aria-label="Chọn ảnh có sẵn"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera size={16} />
                  </button>
                  <button type="button" className="m-cam-shutter" aria-label="Chụp ảnh" onClick={capture} />
                  <button
                    type="button"
                    className="m-cam-toggle"
                    aria-label="Đổi camera"
                    onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
          </Field>
        ) : null}

        <Field label="Vị trí chấm công">
          <div className={`m-geo ${coords ? 'ok' : geoError ? 'bad' : ''}`}>
            {locating ? <RefreshCw size={15} className="spin" /> : <MapPin size={15} />}
            <div>
              {locating ? (
                <span>Đang xác định vị trí…</span>
              ) : coords ? (
                <>
                  <b>Đã xác định vị trí.</b> Sai số ±{coords.accuracy} m.
                  <br />
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  {locationNames ? <><br />Địa điểm hợp lệ: {locationNames}</> : null}
                </>
              ) : (
                <span>{geoError ?? 'Chưa có vị trí.'}</span>
              )}
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Button size="sm" icon={RefreshCw} onClick={locate} disabled={locating}>
              Lấy lại vị trí
            </Button>
          </div>
          <div className="m-form-hint">
            {home.position.anywhere
              ? 'Vị trí của bạn được phép chấm công mọi nơi.'
              : 'Bạn cần ở trong bán kính cho phép của một địa điểm đã cấu hình.'}
          </div>
        </Field>

        <Field label="Ghi chú (không bắt buộc)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: vào ca từ cổng chính"
          />
        </Field>

        {serverError ? <div className="m-banner danger">{serverError}</div> : null}

        {home.punches.length ? (
          <div className="m-geo">
            <TabletSmartphone size={15} />
            <div>
              Hôm nay đã chấm: {home.punches.map((p) => `${p.kind === 'in' ? 'vào' : 'ra'} ${partyTime(p.at)}`).join(' · ')}
            </div>
          </div>
        ) : null}

        <div className="m-form-hint">
          Bằng việc xác nhận, bạn đồng ý ghi nhận vị trí và thời gian chấm công thực tế.
        </div>
      </div>
    </Sheet>
  );
}
