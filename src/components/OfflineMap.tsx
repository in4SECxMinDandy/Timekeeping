import { useId, useMemo, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  name: string;
  sub?: string;
  tone?: 'brand' | 'green' | 'amber' | 'slate' | 'red';
  selected?: boolean;
  onClick?: () => void;
}

export interface MapLocation {
  id: string;
  lat: number;
  lng: number;
  name: string;
  radius: number;
}

export default function OfflineMap({
  points = [],
  locations = [],
  height = 280,
  onPick,
  children,
  className = '',
}: {
  points?: MapPoint[];
  locations?: MapLocation[];
  height?: number;
  onPick?: (lat: number, lng: number) => void;
  children?: ReactNode;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const bounds = useMemo(() => {
    const coords = [...points, ...locations];
    if (!coords.length) {
      return { minLat: 21.0, maxLat: 21.06, minLng: 105.76, maxLng: 105.87 };
    }
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const c of coords) {
      minLat = Math.min(minLat, c.lat);
      maxLat = Math.max(maxLat, c.lat);
      minLng = Math.min(minLng, c.lng);
      maxLng = Math.max(maxLng, c.lng);
    }
    const latPad = Math.max((maxLat - minLat) * 0.35, 0.0035);
    const lngPad = Math.max((maxLng - minLng) * 0.35, 0.0035);
    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad,
    };
  }, [points, locations]);

  const project = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { left: Math.min(96, Math.max(4, x)), top: Math.min(94, Math.max(8, y)) };
  };

  return (
    <div
      className={`map-canvas ${onPick ? 'is-pickable' : ''} ${className}`}
      style={{ height }}
      onClick={
        onPick
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              const lng = bounds.minLng + x * (bounds.maxLng - bounds.minLng);
              const lat = bounds.maxLat - y * (bounds.maxLat - bounds.minLat);
              onPick(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
            }
          : undefined
      }
      role={onPick ? 'button' : undefined}
      tabIndex={onPick ? 0 : undefined}
      aria-label={onPick ? 'Chọn toạ độ trên bản đồ' : undefined}
    >
      <svg className="map-base" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={`grid-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#e3e9ed" strokeWidth="0.35" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="#eef2f4" />
        <rect width="100" height="100" fill={`url(#grid-${uid})`} />
        <path
          d="M -5 78 C 18 70, 30 82, 48 72 S 78 58, 104 66 L 104 104 L -5 104 Z"
          fill="#dfeef7"
          opacity="0.9"
        />
        <g stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M -4 28 C 22 30, 34 24, 58 30 S 86 26, 104 34" />
          <path d="M 16 -4 C 18 24, 26 48, 22 76 S 28 94, 26 104" />
          <path d="M 68 -4 C 66 22, 74 40, 70 62 S 72 90, 80 104" />
          <path d="M -4 54 C 20 50, 42 58, 62 52 S 88 48, 104 52" />
        </g>
        <g stroke="#e2e8ec" strokeWidth="0.6" fill="none">
          <path d="M -4 14 H 104" />
          <path d="M -4 40 H 104" />
          <path d="M -4 64 H 104" />
          <path d="M -4 88 H 104" />
          <path d="M 38 -4 V 104" />
          <path d="M 52 -4 V 104" />
          <path d="M 86 -4 V 104" />
        </g>
        <g fill="#e5ecef">
          <rect x="28" y="6" width="7" height="5" rx="0.6" />
          <rect x="42" y="17" width="6" height="6" rx="0.6" />
          <rect x="76" y="12" width="8" height="5" rx="0.6" />
          <rect x="6" y="58" width="8" height="5" rx="0.6" />
          <rect x="44" y="80" width="7" height="5" rx="0.6" />
        </g>
      </svg>

      <div className="map-pins">
        {locations.map((loc) => {
          const p = project(loc.lat, loc.lng);
          return (
            <div key={loc.id} className="map-loc" style={{ left: `${p.left}%`, top: `${p.top}%` }}>
              <span className="map-loc-ring" style={{ width: 54, height: 54 }} />
              <span className="map-loc-dot">
                <Building2 size={11} />
              </span>
              <span className="map-loc-name">{loc.name}</span>
            </div>
          );
        })}
        {points.map((pt) => {
          const p = project(pt.lat, pt.lng);
          return (
            <button
              key={pt.id}
              type="button"
              className={`map-pin ${pt.selected ? 'is-selected' : ''} ${
                pt.tone === 'green' ? 'is-active' : pt.tone === 'amber' || pt.tone === 'red' ? 'is-outside' : pt.tone === 'slate' ? 'is-done' : ''
              }`}
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
              onClick={(e) => {
                e.stopPropagation();
                pt.onClick?.();
              }}
              title={pt.sub ? `${pt.name} · ${pt.sub}` : pt.name}
            >
              <span className="map-pin-dot" style={pt.tone === 'red' ? { background: 'var(--red)' } : undefined} />
              <span className="map-pin-label">{pt.name}</span>
            </button>
          );
        })}
      </div>
      {children}
      <div className="map-legend">
        <span><i style={{ background: 'var(--green)' }} /> Trong ca</span>
        <span><i style={{ background: 'var(--brand)' }} /> Đã chấm</span>
        <span><i style={{ background: 'var(--amber)' }} /> Cần chú ý</span>
        <span><i style={{ background: '#475467' }} /> Địa điểm</span>
      </div>
    </div>
  );
}
