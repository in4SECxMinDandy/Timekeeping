import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

interface Reply {
  status: number;
  body: any;
}

/** Client tối giản giữ lại cookie phiên của Express. */
class Client {
  private cookie = '';
  constructor(private readonly base: string) {}

  async request(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Reply> {
    const res = await fetch(this.base + url, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* giữ nguyên text */
    }
    return { status: res.status, body: parsed };
  }

  get(url: string, headers?: Record<string, string>) {
    return this.request('GET', url, undefined, headers);
  }

  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('POST', url, body ?? {}, headers);
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* server chưa mở cổng */
    }
    if (Date.now() > deadline) throw new Error('Server không khởi động được');
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Khởi động đúng tiến trình server thật (npm start) với DATA_DIR tạm. */
async function startServer(dataDir: string): Promise<{ child: ChildProcess; base: string; stop: () => Promise<void> }> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (c) => logs.push(String(c)));
  child.stderr?.on('data', (c) => logs.push(String(c)));
  try {
    await waitForHealth(base);
  } catch (err) {
    child.kill('SIGKILL');
    throw new Error(`${(err as Error).message}\n${logs.join('')}`);
  }
  return {
    child,
    base,
    stop: async () => {
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 4000);
      });
    },
  };
}

function loginBody(email: string, pin: string, deviceId: string, surface: 'admin' | 'employee' = 'employee') {
  return { companyCode: 'ANPHAT', email, pin, deviceId, deviceLabel: `Test ${deviceId}`, surface };
}

describe('API chấm công', () => {
  let dataDir: string;
  let server: Awaited<ReturnType<typeof startServer>>;
  let anon: Client;
  let today: string;

  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'cc-api-'));
    server = await startServer(dataDir);
    anon = new Client(server.base);
    const health = await anon.get('/api/health');
    today = health.body.date;
  });

  after(async () => {
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('health trả về ngày hiện tại theo giờ VN', async () => {
    const res = await anon.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.match(res.body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(res.body.time, /^\d{2}:\d{2}:\d{2}$/);
  });

  it('route không tồn tại trả 404 có mã lỗi', async () => {
    const res = await anon.get('/api/khong-ton-tai');
    assert.equal(res.status, 404);
    assert.ok(res.body.code);
  });

  it('chặn origin từ tên miền khác', async () => {
    const res = await anon.post('/api/auth/login', loginBody('duc@anphat.vn', '1111', 'x'), {
      origin: 'https://evil.example',
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'BAD_ORIGIN');
  });

  it('chấp nhận request có Origin cùng host với máy chủ', async () => {
    const guest = new Client(server.base);
    const res = await guest.post('/api/auth/login', loginBody('tuan@anphat.vn', '9999', 'dev-same-origin'), {
      origin: server.base,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.employee.email, 'tuan@anphat.vn');
  });

  it('từ chối truy cập dữ liệu khi chưa đăng nhập', async () => {
    const res = await anon.get('/api/me/home');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  });

  it('PIN phải gồm 4–8 chữ số', async () => {
    const res = await anon.post('/api/auth/login', loginBody('duc@anphat.vn', '12', 'dev-duc'));
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'pin');
  });

  it('sai thông tin đăng nhập không lộ tài khoản tồn tại', async () => {
    const wrongPin = await anon.post('/api/auth/login', loginBody('hoa@anphat.vn', '9998', 'dev-x'));
    const wrongMail = await anon.post('/api/auth/login', loginBody('khong@co.vn', '1111', 'dev-x'));
    assert.equal(wrongPin.status, 401);
    assert.equal(wrongMail.status, 401);
    assert.equal(wrongPin.body.message, wrongMail.body.message);
  });

  it('khoá sau 5 lần sai PIN trong 5 phút', async () => {
    const client = new Client(server.base);
    let last;
    for (let i = 0; i < 6; i++) {
      last = await client.post('/api/auth/login', loginBody('vy@anphat.vn', '1234', 'dev-vy'));
    }
    assert.equal(last!.status, 429);
    assert.equal(last!.body.code, 'RATE_LIMITED');
  });

  it('đăng nhập nhân viên gắn thiết bị và trả thông tin công ty', async () => {
    const res = await anon.post('/api/auth/login', loginBody('duc@anphat.vn', '1111', 'dev-duc'));
    assert.equal(res.status, 200);
    assert.equal(res.body.employee.email, 'duc@anphat.vn');
    assert.equal(res.body.employee.deviceId, 'dev-duc');
    assert.equal(res.body.company.code, 'ANPHAT');
    assert.equal(res.body.redirect, '/m/');
    assert.equal(res.body.employee.pinHash, undefined);

    const me = await anon.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.employee.id, res.body.employee.id);
  });

  it('không cho đăng nhập từ thiết bị khác', async () => {
    const other = new Client(server.base);
    const res = await other.post('/api/auth/login', loginBody('duc@anphat.vn', '1111', 'dev-khac'));
    assert.equal(res.status, 423);
    assert.equal(res.body.code, 'DEVICE_LOCKED');
  });

  it('nhân viên không vào được API quản trị', async () => {
    const res = await anon.get('/api/admin/employees');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  it('chấm công trong phạm vi rồi chặn chấm trùng', async () => {
    const home = await anon.get('/api/me/home');
    assert.equal(home.status, 200);
    const [loc] = home.body.locations;
    assert.ok(loc, 'vị trí phải có địa điểm chấm công');

    if (!home.body.shift) {
      const res = await anon.post('/api/me/punch', { lat: loc.lat, lng: loc.lng });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /không có ca/i);
      return;
    }

    // Dữ liệu mẫu có thể đã có lần chấm vào hôm nay nên đi theo trạng thái thực tế.
    const state = { hasIn: false, hasOut: false };
    const punchOnce = async () => {
      const res = await anon.post('/api/me/punch', { lat: loc.lat, lng: loc.lng, accuracy: 8 });
      if (!state.hasIn) {
        assert.equal(res.status, 200);
        assert.equal(res.body.kind, 'in');
        assert.equal(res.body.punch.outside, false);
        state.hasIn = true;
      } else if (!state.hasOut) {
        assert.equal(res.status, 200);
        assert.equal(res.body.kind, 'out');
        state.hasOut = true;
      } else {
        assert.equal(res.status, 409);
        assert.equal(res.body.code, 'ALREADY_PUNCHED');
      }
      return res;
    };
    state.hasIn = home.body.punches.some((p: any) => p.kind === 'in');
    state.hasOut = home.body.punches.some((p: any) => p.kind === 'out');
    const added = state.hasIn ? (state.hasOut ? 0 : 1) : 2;

    await punchOnce();
    await punchOnce();
    await punchOnce();

    const after = await anon.get('/api/me/home');
    assert.equal(after.body.punchState, 'done');
    assert.equal(after.body.day.outside, false);
    assert.equal(after.body.punches.length, home.body.punches.length + added);
  });

  it('từ chối chấm công ngoài phạm vi và trả khoảng cách', async () => {
    const lan = new Client(server.base);
    const login = await lan.post('/api/auth/login', loginBody('lan@anphat.vn', '9999', 'dev-lan'));
    assert.equal(login.status, 200);
    const home = await lan.get('/api/me/home');
    const [loc] = home.body.locations;
    const res = await lan.post('/api/me/punch', { lat: loc.lat + 0.5, lng: loc.lng + 0.5 });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'OUTSIDE_ZONE');
    assert.ok(res.body.distance > loc.radius);
  });

  it('từ chối vị trí không hợp lệ', async () => {
    const res = await anon.post('/api/me/punch', { lat: 999, lng: 0 });
    assert.equal(res.status, 400);
  });

  it('gửi đơn hợp lệ rồi quản lý duyệt và nhân viên nhận thông báo', async () => {
    const created = await anon.post('/api/me/requests', {
      type: 'explain',
      payload: { kind: 'explain', date: today, reason: 'E2E: quên chấm công lúc trưa' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'pending');

    const admin = new Client(server.base);
    const login = await admin.post(
      '/api/auth/login',
      loginBody('thao@anphat.vn', '1234', 'dev-thao', 'admin'),
    );
    assert.equal(login.status, 200);
    assert.equal(login.body.redirect, '/app/');

    const workbench = await admin.get('/api/admin/workbench');
    assert.equal(workbench.status, 200);
    const task = workbench.body.tasks.find((t: any) => t.requestId === created.body.id);
    assert.ok(task, 'đơn mới phải xuất hiện ở bảng điều phối');

    const decided = await admin.post('/api/admin/decisions', {
      requestId: created.body.id,
      action: 'approve',
      note: 'Đã ghi nhận giải trình',
    });
    assert.equal(decided.status, 200);

    const mine = await anon.get('/api/me/requests');
    const approved = mine.body.requests.find((r: any) => r.id === created.body.id);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.decisionNote, 'Đã ghi nhận giải trình');

    const notes = await anon.get('/api/me/notifications');
    assert.ok(
      notes.body.notifications.some((n: any) => n.title.includes('đã được duyệt')),
      'phải có thông báo kết quả duyệt đơn',
    );
  });

  it('bắt lỗi nội dung đơn ngay ở máy chủ', async () => {
    const mismatch = await anon.post('/api/me/requests', {
      type: 'explain',
      payload: { kind: 'forgot', date: today, shiftId: 'sh_hc', reason: 'Sai loại nội dung' },
    });
    assert.equal(mismatch.status, 400);

    const shortReason = await anon.post('/api/me/requests', {
      type: 'explain',
      payload: { kind: 'explain', date: today, reason: 'ab' },
    });
    assert.equal(shortReason.status, 400);
    assert.match(shortReason.body.message, /lý do/i);

    const future = await anon.post('/api/me/requests', {
      type: 'explain',
      payload: { kind: 'explain', date: '2099-01-01', reason: 'Ngày trong tương lai' },
    });
    assert.equal(future.status, 400);
  });

  it('nhân sự không được sửa cấu hình hệ thống', async () => {
    const hr = new Client(server.base);
    await hr.post('/api/auth/login', loginBody('mai@anphat.vn', '2345', 'dev-mai', 'admin'));
    const res = await hr.request('PATCH', '/api/admin/settings', { settings: { otMinMinutes: 45 } });
    assert.equal(res.status, 403);

    const admin = new Client(server.base);
    await admin.post('/api/auth/login', loginBody('thao@anphat.vn', '1234', 'dev-thao', 'admin'));
    const ok = await admin.request('PATCH', '/api/admin/settings', { settings: { otMinMinutes: 45 } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.settings.otMinMinutes, 45);

    const badColor = await admin.request('PATCH', '/api/admin/settings', {
      company: { brandColor: 'red' },
    });
    assert.equal(badColor.status, 400);
  });

  it('đăng xuất thu hồi phiên', async () => {
    const guest = new Client(server.base);
    await guest.post('/api/auth/login', loginBody('hoa@anphat.vn', '9999', 'dev-hoa'));
    const before = await guest.get('/api/auth/me');
    assert.equal(before.status, 200);
    await guest.post('/api/auth/logout');
    const afterLogout = await guest.get('/api/auth/me');
    assert.equal(afterLogout.status, 401);
  });

  it('dữ liệu còn nguyên sau khi khởi động lại tiến trình', async () => {
    const dbFile = path.join(dataDir, 'db.json');
    const raw = JSON.parse(await readFile(dbFile, 'utf8'));
    const punchCount = raw.punches.filter((p: any) => p.employeeId === 'e3').length;
    assert.ok(punchCount > 0, 'chấm công phải được ghi xuống đĩa');

    await server.stop();
    // Sửa trực tiếp file để chứng minh server đọc lại đúng bản trên đĩa.
    const tampered = JSON.parse(await readFile(dbFile, 'utf8'));
    tampered.company.appName = 'Chấm công E2E';
    await writeFile(dbFile, JSON.stringify(tampered), 'utf8');

    server = await startServer(dataDir);
    const client = new Client(server.base);
    const login = await client.post('/api/auth/login', loginBody('duc@anphat.vn', '1111', 'dev-duc'));
    assert.equal(login.status, 200);
    assert.equal(login.body.company.appName, 'Chấm công E2E');

    const mine = await client.get('/api/me/requests');
    assert.ok(mine.body.requests.some((r: any) => r.status === 'approved'));

    const home = await client.get('/api/me/home');
    assert.ok(home.body.punches.length > 0, 'punch phải sống sót qua restart');
  });
});
