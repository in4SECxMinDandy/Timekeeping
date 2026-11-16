import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { api } from './routes';
import { ApiError } from './errors';
import { UPLOAD_DIR, getDb } from './store';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DIST = path.join(process.cwd(), 'dist');

app.disable('x-powered-by');

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function hostnameOf(authority: string): string {
  if (authority.startsWith('[')) return authority.slice(0, authority.indexOf(']') + 1).toLowerCase();
  return authority.split(':')[0].toLowerCase();
}

/** Chỉ chấp nhận request đổi dữ liệu có cùng host với máy chủ (hoặc nằm trong allowlist). */
function originAllowed(originHeader: string, requestHost: string): boolean {
  let url: URL;
  try {
    url = new URL(originHeader);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return host === hostnameOf(requestHost) || LOCAL_HOSTS.has(host) || EXTRA_ORIGINS.includes(host);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const origin = req.headers.origin;
  if (origin && WRITE_METHODS.includes(req.method) && !originAllowed(origin, req.headers.host ?? '')) {
    res.status(403).json({ code: 'BAD_ORIGIN', message: 'Nguồn yêu cầu không khớp máy chủ.' });
    return;
  }
  next();
});

app.use(express.json({ limit: '4mb' }));

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '7d',
    fallthrough: false,
    index: false,
  }),
);

app.use('/api', api);

if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<!doctype html><meta charset="utf-8"><title>Chấm công</title>' +
          '<body style="font-family:sans-serif;padding:2rem"><h1>API đang chạy</h1>' +
          '<p>Giao diện chưa được build. Chạy <code>npm run dev</code> và mở ' +
          '<a href="http://localhost:5173">localhost:5173</a>.</p></body>',
      );
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      ...(err.field ? { field: err.field } : {}),
      ...(err.extra ?? {}),
    });
    return;
  }
  const anyErr = err as { type?: string; status?: number; message?: string };
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn.' });
    return;
  }
  if (anyErr?.type === 'entity.parse.failed') {
    res.status(400).json({ code: 'INVALID_JSON', message: 'Dữ liệu JSON không hợp lệ.' });
    return;
  }
  console.error('[server]', err);
  res.status(500).json({ code: 'INTERNAL', message: 'Máy chủ gặp lỗi. Vui lòng thử lại.' });
});

getDb()
  .then((db) => {
    app.listen(PORT, () => {
      console.log(`[chamcong] API http://localhost:${PORT}`);
      console.log(
        `[chamcong] ${db.employees.length} nhân sự · ${db.requests.filter((r) => r.status === 'pending').length} đơn chờ duyệt`,
      );
      if (fs.existsSync(path.join(DIST, 'index.html'))) {
        console.log(`[chamcong] Giao diện http://localhost:${PORT}/app/`);
      }
    });
  })
  .catch((err) => {
    console.error('[chamcong] Không khởi động được:', err);
    process.exit(1);
  });
