const DEVICE_KEY = 'cc_device_id';
const DEVICE_LABEL_KEY = 'cc_device_label';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function deviceLabel(): string {
  const saved = localStorage.getItem(DEVICE_LABEL_KEY);
  if (saved) return saved;
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Trình duyệt';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : 'thiết bị này';
  return `${browser} · ${os}`;
}

export function setDeviceLabel(label: string): void {
  localStorage.setItem(DEVICE_LABEL_KEY, label);
}
