import { fmtDateVN, todayIct } from '../../shared/domain';

export {
  addDays,
  DAY_STATUS_LABEL,
  daySymbol,
  dowOf,
  eachDate,
  fmtDateVN,
  fmtMoney,
  fmtNumber,
  fmtPeriodVN,
  hmToMinutes,
  ictParts,
  isValidDate,
  isValidPeriod,
  leaveTypeLabel,
  minutesToHm,
  monthRange,
  nowIctIso,
  partyTime,
  periodOf,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  requestDuration,
  requestSummary,
  shiftTimeLabel,
  todayIct,
  WEEKDAYS,
  WEEKDAYS_SHORT,
} from '../../shared/domain';

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị viên',
  hr: 'Nhân sự',
  manager: 'Quản lý',
  employee: 'Nhân viên',
};

export const ROLE_TONE: Record<string, 'brand' | 'violet' | 'sky' | 'slate'> = {
  admin: 'brand',
  hr: 'violet',
  manager: 'sky',
  employee: 'slate',
};

export const SALARY_TYPE_LABEL: Record<string, string> = {
  month: 'Theo tháng',
  shift: 'Theo ca',
  hour: 'Theo giờ',
};

export const SHIFT_CALC_LABEL: Record<string, string> = {
  frame: 'Đủ khung giờ',
  actual: 'Theo giờ thực tế',
  actual_late: 'Thực tế + trừ muộn',
};

export const REQUEST_TONE: Record<string, 'violet' | 'sky' | 'warn' | 'success' | 'danger' | 'slate' | 'brand'> = {
  leave: 'sky',
  late_early: 'warn',
  ot: 'violet',
  swap: 'brand',
  register: 'success',
  forgot: 'danger',
  explain: 'slate',
};

export const PHOTO_POLICY_LABEL: Record<string, string> = {
  company: 'Theo công ty',
  required: 'Bắt buộc ảnh',
  exempt: 'Miễn ảnh',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_TONES = ['a', 'b', 'c', 'd', 'e', 'f'];

export function avatarTone(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function shortMoney(n?: number): string {
  if (n === undefined || n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',')} tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  const d = new Date(t + 7 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dateLong(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getUTCDay()];
  return `${weekday}, ${fmtDateVN(date)}`;
}

export function dateShort(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getUTCDay()];
  return `${weekday} ${fmtDateVN(date, { short: true })}`;
}

export function periodLabel(period: string): string {
  return `Tháng ${Number(period.slice(5))}/${period.slice(0, 4)}`;
}

export function monthInputValue(period: string): string {
  return period;
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentPeriod(): string {
  return todayIct().slice(0, 7);
}

export function clockLabel(iso: string): string {
  return iso.slice(11, 16);
}

export function weekdayLabel(weekday: number): string {
  return ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'][weekday] ?? '';
}

export function formatMinutes(minutes?: number): string {
  if (!minutes) return '0 phút';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} phút`;
  return m ? `${h}g ${m}p` : `${h} giờ`;
}

export function shiftTone(shiftId?: string): string {
  const tones = ['shift-a', 'shift-b', 'shift-c', 'shift-d', 'shift-e'];
  if (!shiftId) return 'shift-a';
  let h = 0;
  for (let i = 0; i < shiftId.length; i++) h = (h * 33 + shiftId.charCodeAt(i)) % 101;
  return tones[h % tones.length];
}
