# Timekeeping — Chấm công & E-HRM (bản tái tạo độc lập)

Ứng dụng quản lý chấm công, xếp ca và tính lương cho doanh nghiệp nhỏ, chạy **hoàn toàn cục bộ** với một file dữ liệu JSON duy nhất và **không gọi bất kỳ dịch vụ bên ngoài nào** lúc runtime.

Dự án gồm hai giao diện dùng chung một API:

| Giao diện | Đường dẫn | Dành cho |
| --- | --- | --- |
| Trang quản trị | `/app/` | Quản trị, nhân sự, quản lý |
| Ứng dụng nhân viên | `/m/` | Nhân viên (giao diện mobile-first) |

> **Lưu ý về bản quyền:** đây là bản dựng lại **độc lập** về ý tưởng sản phẩm, dùng cho mục đích demo và học tập. Toàn bộ mã nguồn, dữ liệu mẫu, thương hiệu "An Phát", font và hình ảnh đều là tài sản tự tạo; không sao chép logo, hình ảnh, font hay nội dung của sản phẩm gốc. Dự án không liên kết với bất kỳ nhà cung cấp phần mềm chấm công nào.

---

## Mục lục

- [Tính năng chính](#tính-năng-chính)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Chạy nhanh](#chạy-nhanh)
- [Tài khoản demo](#tài-khoản-demo)
- [Biến môi trường](#biến-môi-trường)
- [Dữ liệu và khởi tạo lại](#dữ-liệu-và-khởi-tạo-lại)
- [Quy tắc chấm công](#quy-tắc-chấm-công)
- [Công thức tính lương](#công-thức-tính-lương)
- [Phân quyền](#phân-quyền)
- [Tổng quan API](#tổng-quan-api)
- [Kiểm thử](#kiểm-thử)
- [Triển khai lên máy chủ](#triển-khai-lên-máy-chủ)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Bảo mật và giới hạn](#bảo-mật-và-giới-hạn)

---

## Tính năng chính

### Trang quản trị (`/app/`)

- **Bảng điều phối (Workbench)** — số liệu tổng quan trong ngày: người đã vào ca, đi muộn, vắng, đơn chờ duyệt, việc cần xử lý.
- **Điều phối (Dispatch)** — duyệt/từ chối đơn từ, xử lý chấm công bất thường, xem bảng công nhanh.
- **Bảng công (Timesheet)** — bảng công theo tháng cho từng nhân viên, sửa tay từng ngày (công, tăng ca, miễn muộn, chấp nhận ngoài phạm vi/sai ca), duyệt hàng loạt, xuất `.xls`.
- **Xếp ca (Schedule)** — gán ca theo ngày/tháng, chia ca, sao chép lịch, đăng ký ca, đổi ca.
- **Lương (Payroll)** — tính lương theo tháng, thêm thưởng/phạt thủ công, xuất `.xls`, **công bố** phiếu lương cho nhân viên và **thu hồi** khi cần.
- **Nhân sự (Employees)** — thêm/sửa/khoá nhân viên, gán vị trí, ca riêng, địa điểm riêng, quản lý thiết bị, đặt lại PIN, mở khoá thiết bị, thêm hàng loạt.
- **Vị trí (Positions)** — cấu hình lương, bậc lương, ngày công chuẩn, ngày phép, phụ cấp, thưởng cố định, hệ số tăng ca, bảo hiểm, chính sách ảnh, ca và địa điểm được phép.
- **Địa điểm (Locations)** — địa điểm chấm công với toạ độ và bán kính, bản đồ SVG tự vẽ (không dùng dịch vụ bản đồ ngoài).
- **Cài đặt (Settings)** — ngày làm việc trong tuần, chế độ đi muộn, ngưỡng tăng ca tối thiểu, yêu cầu ảnh, ngày chốt lương, bật/tắt tính lương, thông tin công ty.

### Ứng dụng nhân viên (`/m/`)

- **Chấm công vào/ra ca** bằng GPS trình duyệt, kiểm tra bán kính bằng công thức Haversine; chụp ảnh bằng camera trước khi công ty yêu cầu; chặn chấm công ngoài phạm vi.
- **Bảng công cá nhân** — trạng thái từng ngày, giờ vào/ra, đi muộn, tăng ca, ký hiệu ngày công.
- **Lịch ca** — ca đã xếp, ca đăng ký, ca đổi.
- **Đơn từ** — nghỉ phép, đi muộn/về sớm, tăng ca, đổi ca, đăng ký ca, quên chấm công, giải trình.
- **Phiếu lương** — chi tiết từng khoản, chỉ hiển thị khi quản trị đã công bố.
- **Thông báo** — nhắc duyệt đơn, phiếu lương mới, thông báo hệ thống.
- **Hồ sơ** — thông tin cá nhân, vị trí, thiết bị đang khoá.

---

## Công nghệ sử dụng

| Lớp | Công nghệ |
| --- | --- |
| Frontend | React 19, React Router 7, TypeScript, Vite 7 |
| UI | CSS thuần viết tay, icon `lucide-react`, font Be Vietnam Pro tự host qua `@fontsource` |
| Backend | Node.js, Express 5, TypeScript chạy trực tiếp bằng `tsx` |
| Lưu trữ | Một file `data/db.json`, ghi nguyên tử (write → rename), tuần tự hoá mọi thao tác ghi |
| Kiểm thử | `node:test` + `tsx` (test engine thuần và test API chạy tiến trình thật) |
| Đóng gói | Docker multi-stage (`node:22-alpine`) |

Không có CDN, không font/JS/CSS bên thứ ba tải lúc runtime, không database ngoài.

---

## Chạy nhanh

Yêu cầu: **Node.js 22+** và npm.

```bash
npm ci
npm run dev
```

- Giao diện: <http://localhost:5173> (Vite dev server, proxy `/api` và `/uploads` sang cổng 3001)
- API: <http://localhost:3001>
- Kiểm tra sức khoẻ API: <http://localhost:3001/api/health>

Chạy như bản build thật (một cổng duy nhất):

```bash
npm run build
npm start
# Trang quản trị:  http://localhost:3001/app/
# Ứng dụng nhân viên: http://localhost:3001/m/
```

Chạy bằng Docker:

```bash
docker compose up -d --build
# http://localhost:3001/app/ · http://localhost:3001/m/
```

Thư mục `./data` được bind-mount vào `/data` trong container, nên dữ liệu vẫn còn sau khi khởi động lại.

### Các lệnh npm

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy song song API (`tsx watch`) và Vite |
| `npm run dev:api` | Chỉ chạy API ở chế độ watch |
| `npm run dev:web` | Chỉ chạy Vite |
| `npm run build` | Build SPA vào `dist/` |
| `npm start` | Chạy server production (phục vụ luôn `dist/`) |
| `npm run typecheck` | Kiểm tra TypeScript strict cho cả client và server |
| `npm test` | Chạy toàn bộ test (engine + API) |
| `npm run test:domain` | Chỉ chạy test engine chấm công |

---

## Tài khoản demo

Mã công ty: **ANPHAT**

- Trang quản trị đăng nhập tại `/login`
- Ứng dụng nhân viên đăng nhập tại `/m/login`

| Email | PIN | Vai trò | Vị trí |
| --- | --- | --- | --- |
| thao@anphat.vn | 1234 | Quản trị | Trưởng phòng |
| mai@anphat.vn | 2345 | Nhân sự | Kế toán |
| hung@anphat.vn | 2222 | Quản lý | Kinh doanh |
| duc@anphat.vn | 1111 | Nhân viên | Kinh doanh |
| lan@anphat.vn | 9999 | Nhân viên | Hành chính |
| tuan@anphat.vn | 9999 | Nhân viên | Kinh doanh |
| hoa@anphat.vn | 9999 | Nhân viên | Hành chính |
| vy@anphat.vn | 9999 | Nhân viên | Thực tập sinh |
| son@anphat.vn | 9999 | Nhân viên | Vệ sinh công nghiệp |

Trên trang đăng nhập có sẵn danh sách tài khoản mẫu để bấm chọn. PIN được lưu dưới dạng băm `scrypt` kèm salt, không lưu plaintext.

> Màn đăng nhập in sẵn email + PIN mẫu, nên khi đưa bản demo lên Internet cần khoá bằng `auth_basic` của nginx hoặc ẩn danh sách tài khoản mẫu.

---

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3001` | Cổng HTTP của server |
| `DATA_DIR` | `./data` | Thư mục chứa `db.json` và `uploads/` |
| `ALLOWED_ORIGINS` | (rỗng) | Danh sách hostname được phép, phân tách bằng dấu phẩy, dùng khi app nằm sau proxy có host khác Origin trình duyệt gửi tới |

---

## Dữ liệu và khởi tạo lại

- Toàn bộ dữ liệu nằm trong **một file** `data/db.json`.
- Ảnh chấm công tải lên nằm ở `data/uploads/`.
- Ghi dữ liệu được tuần tự hoá qua một hàng đợi và ghi nguyên tử (ghi file tạm rồi `rename`), tránh hỏng file khi có nhiều request đồng thời.
- Muốn có dữ liệu mẫu mới:
  1. Dừng server, **xóa `data/db.json`**, khởi động lại; hoặc
  2. Gọi `POST /api/admin/reset` với body `{"confirm":"RESET"}` bằng tài khoản quản trị.
- Bản seed tạo sẵn công ty An Phát, 2 địa điểm, 6 ca, 6 vị trí, ngày lễ Việt Nam, nhân viên, lịch ca, chấm công và đơn từ mẫu cho tháng hiện tại và tháng trước.

Thư mục `data/`, `dist/`, `node_modules/` và file `.env*` đã nằm trong `.gitignore`.

---

## Quy tắc chấm công

Toàn bộ tính toán nằm trong [`shared/domain.ts`](shared/domain.ts) — hàm thuần, dùng chung cho server, seed, test và formatter phía client. Nhờ vậy cùng một logic được dùng ở mọi nơi và có thể kiểm thử độc lập.

### Ca làm việc

- Ca có giờ bắt đầu/kết thúc, có thể có nghỉ giữa ca, hỗ trợ **ca qua đêm** (giờ ra nhỏ hơn giờ vào) và **ca phức hợp**.
- Ba kiểu tính công:
  - `frame` — tính theo khung ca (đủ giờ vào/ra là hưởng công).
  - `actual` — tính theo thời gian thực có mặt.
  - `actual_late` — tính theo thời gian thực nhưng trừ phần đi muộn.
- Quy đổi **công lẻ 0,5** khi đạt ngưỡng nửa ngày (`halfMinutes`).
- Ca có dung sai đi muộn (`lateAllow`) và ngưỡng tăng ca tối thiểu riêng (`otMin`).

### Trạng thái một ngày

`future`, `off`, `holiday`, `leave`, `absent`, `ok`, `late`, `missing`, `inprogress`. Ý nghĩa cụ thể:

- Hôm nay **chưa tới giờ vào** → "Chưa tới".
- **Đang trong ca** → "Đang trong ca".
- Chỉ khi **đã qua giờ ra** mới quy vắng mặt.
- Thiếu một trong hai lần chấm công → "Thiếu chấm công" (có thể giải trình).

### Đi muộn

Hai chế độ trong cài đặt:

- `full` — tính trọn thời gian đi muộn.
- `excess` — chỉ tính phần vượt dung sai.

Có thể miễn trừ đi muộn cho từng ngày hoặc thông qua đơn đã duyệt.

### Tăng ca

- Ngưỡng tối thiểu chung (`otMinMinutes`, mặc định 30 phút) và ngưỡng riêng theo ca.
- Hệ số theo **ngày thường / thứ bảy nghỉ / chủ nhật / ngày lễ** cấu hình trong vị trí.
- Duyệt một phần thì phần đã duyệt được tính lương, phần còn lại giữ trạng thái chờ.

### Ngày lễ và nghỉ phép

- Ngày lễ vẫn hưởng công.
- Đi làm ngày lễ được tính **toàn bộ thời gian là tăng ca** với hệ số ngày lễ.
- Đơn nghỉ phép đã duyệt tác động trực tiếp vào bảng công; kiểm tra trùng lặp và số ngày phép năm còn lại.

### Đơn từ

Bảy loại đơn: nghỉ phép (`leave`), đi muộn/về sớm (`late_early`), tăng ca (`ot`), đổi ca (`swap`), đăng ký ca (`register`), quên chấm công (`forgot`), giải trình (`explain`).

Đơn đã duyệt được áp vào bảng công theo thứ tự ưu tiên: **ca riêng của ngày → đăng ký ca → đổi ca → lịch ca gốc**. Đổi ca còn có thể biến một ngày có ca thành ngày nghỉ.

### Chấm công ngoài phạm vi

- Server tính khoảng cách từ vị trí gửi lên tới địa điểm gần nhất bằng **Haversine** (bán kính Trái Đất 6.371 km).
- Ngoài bán kính → trả `422 OUTSIDE_ZONE`, kèm khoảng cách, bán kính và tên địa điểm để client hiển thị.
- Chấm công khác ca được xếp → bị gắn cờ `wrong_shift`; quản trị viên có thể chấp nhận từng ngày.
- Vị trí có thể cấu hình "làm ở bất kỳ đâu" (`anywhere`) để bỏ qua bán kính.

---

## Công thức tính lương

Vị trí quyết định cách tính lương (`salaryType`):

| Kiểu | Công thức lương cơ bản |
| --- | --- |
| `month` | `baseSalary / standardDays × tổng công` (mặc định 26 ngày công chuẩn) |
| `shift` | `baseSalary × tổng công` |
| `hour` | `baseSalary × số phút làm việc / 60` |

Các khoản cộng thêm:

- **Tăng ca:** `đơn giá giờ / 60 × Σ(phút tăng ca đã duyệt × hệ số)`.
- **Phụ cấp:** loại `day` nhân với số ngày có công, loại `month` cộng cố định.
- **Thưởng cố định** của vị trí.
- **Thưởng/phạt nhập tay** theo từng nhân viên và kỳ lương.

Khấu trừ và thực lĩnh:

```
gross = lương cơ bản + tăng ca + phụ cấp + thưởng cố định + điều chỉnh
BHXH  = 10,5% × (lương cơ bản + phụ cấp)      // nếu vị trí bật bảo hiểm
net   = gross − BHXH
```

Phiếu lương lưu sẵn từng dòng (`lines`) và từng ngày (`days`) tại thời điểm công bố, nên số liệu nhân viên nhìn thấy không thay đổi khi bảng công bị sửa sau đó. Quản trị có thể **công bố** hoặc **thu hồi** kỳ lương; nhân viên chỉ thấy phiếu đã công bố.

---

## Phân quyền

| Vai trò | Quyền |
| --- | --- |
| `admin` | Toàn bộ, gồm cài đặt công ty và reset dữ liệu |
| `hr` | Toàn bộ nghiệp vụ: nhân sự, vị trí, ca, địa điểm, lương, bảng công |
| `manager` | Xem/duyệt trong phạm vi nhân viên mình quản lý (đi ngược chuỗi `managerId`) |
| `employee` | Chỉ dữ liệu của bản thân: chấm công, đơn từ, bảng công, phiếu lương |

Router `/api/admin/*` yêu cầu một trong ba vai trò `admin`, `hr`, `manager`; các thao tác cấu hình (`setupOnly`) chỉ `admin` và `hr`. Router `/api/me/*` chỉ trả dữ liệu của chính người đăng nhập.

---

## Tổng quan API

Base URL: `/api`. Tất cả response lỗi có dạng:

```json
{ "code": "BAD_ORIGIN", "message": "Nguồn yêu cầu không khớp máy chủ." }
```

### Công khai

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| `GET` | `/api/health` | Kiểm tra server sống, trả ngày/giờ ICT |
| `POST` | `/api/auth/login` | Đăng nhập bằng mã công ty + email + PIN + mã thiết bị |
| `POST` | `/api/auth/logout` | Đăng xuất, xoá phiên |
| `GET` | `/api/auth/me` | Thông tin người đăng nhập |

### Quản trị (`/api/admin/*`)

| Nhóm | Đường dẫn tiêu biểu |
| --- | --- |
| Bảng điều phối | `GET /workbench`, `GET /dispatch`, `POST /decisions` |
| Bảng công | `GET /timesheet`, `GET /timesheet/:employeeId`, `PATCH /timesheet/:employeeId/:date`, `POST /timesheet/bulk-approve` |
| Xếp ca | `GET/PUT /schedule`, `POST /schedule/spread`, `POST /schedule/copy` |
| Lương | `GET /payroll`, `GET /payroll/:employeeId`, `POST /payroll/adjustments`, `DELETE /payroll/adjustments/:id`, `POST /payroll/publish`, `POST /payroll/revoke` |
| Nhân sự | `GET/POST /employees`, `PATCH/DELETE /employees/:id`, `POST /employees/:id/reset-pin`, `POST /employees/:id/unlock`, `POST /employees/unlock-all`, `POST /employees/bulk` |
| Danh mục | `GET/POST/PATCH/DELETE /positions`, `/shifts`, `/locations`, `POST/DELETE /holidays` |
| Cài đặt | `GET/PATCH /settings`, `POST /reset` |
| Xuất file | `GET /export/timesheet`, `GET /export/payroll` (file `.xls`) |

### Nhân viên (`/api/me/*`)

| Method | Đường dẫn | Mô tả |
| --- | --- | --- |
| `GET` | `/me/home` | Tổng quan hôm nay |
| `POST` | `/me/punch` | Chấm công vào/ra kèm GPS, ảnh, ghi chú |
| `GET` | `/me/timesheet` | Bảng công cá nhân |
| `GET` | `/me/schedule` | Lịch ca cá nhân |
| `GET/POST` | `/me/requests` | Danh sách và gửi đơn từ |
| `GET` | `/me/payslips`, `/me/payslips/:period` | Danh sách và chi tiết phiếu lương đã công bố |
| `GET` | `/me/notifications` | Thông báo |
| `POST` | `/me/notifications/read` | Đánh dấu đã đọc |

---

## Kiểm thử

```bash
npm run typecheck   # TypeScript strict cho cả client và server
npm test            # 54 test: 35 test engine + 19 test API
npm run build       # build production
```

`npm test` chạy hai tầng:

1. **Test engine** (`tests/domain.test.ts`) — kiểm tra các hàm thuần: khung ca, ca qua đêm, đi muộn, tăng ca, ngày lễ, nghỉ phép, quy đổi công lẻ, tính lương, Haversine.
2. **Test API** (`tests/api.test.ts`) — tạo thư mục dữ liệu tạm, **khởi động tiến trình server thật** bằng `tsx`, đăng nhập, chấm công, gửi và duyệt đơn, xuất file, rồi **khởi động lại server** để xác nhận dữ liệu còn nguyên trên đĩa và phiên/thiết bị được xử lý đúng.

Kết quả mong đợi: `54 pass, 0 fail`.

---

## Triển khai lên máy chủ

Ảnh Docker tự chứa: build SPA ở stage trung gian, chạy `node --import tsx server/index.ts` ở stage cuối, chạy bằng user `node` (uid 1000), có `HEALTHCHECK` gọi `/api/health`.

```bash
docker build -t chamcong-clone .
docker save chamcong-clone | gzip | ssh root@<host> 'gunzip | docker load'
```

Hoặc push lên registry rồi pull về máy chủ. Sau đó:

```bash
ssh root@<host> 'mkdir -p /opt/chamcong/data && chown -R 1000:1000 /opt/chamcong/data \
  && docker run -d --name chamcong --restart unless-stopped \
     -p 127.0.0.1:3050:3001 -v /opt/chamcong/data:/data chamcong-clone'
```

Lưu ý khi vận hành:

- **`chown 1000:1000` là bắt buộc** — container chạy bằng user `node` (uid 1000); bind-mount do root sở hữu sẽ lỗi `EACCES: mkdir '/data/uploads'`.
- Đặt nginx đứng trước, chỉ nghe ở loopback cho app và bật HTTPS. **Trình duyệt chỉ cấp quyền định vị trên origin an toàn**, nên chấm công cần `https://` (hoặc `http://localhost`).
- Đặt `ALLOWED_ORIGINS=<tên miền>` nếu app nằm sau proxy có host khác với Origin trình duyệt gửi tới.
- Kiểm tra origin chỉ so khớp hostname; yêu cầu ghi từ domain lạ nhận `403 BAD_ORIGIN`.
- Kiểm tra sức khoẻ: `curl http://127.0.0.1:3050/api/health`.

---

## Cấu trúc thư mục

```
shared/            kiểu dữ liệu và engine chấm công thuần
  types.ts         toàn bộ mô hình dữ liệu (Employee, Shift, Payslip, Db, …)
  domain.ts        engine tính công/lương, format, validate (766 dòng)
server/            Express 5
  index.ts         khởi động, static SPA, kiểm tra Origin, xử lý lỗi
  routes.ts        toàn bộ endpoint /api
  auth.ts          PIN scrypt, phiên, thiết bị, rate limit, phân quyền
  compute.ts       tổng hợp ngày/tháng, Haversine, chọn địa điểm/ca khi chấm công
  service.ts       dữ liệu cho từng màn hình, thông báo, công bố lương
  seed.ts          sinh dữ liệu mẫu
  store.ts         đọc/ghi db.json nguyên tử
  export.ts        xuất bảng công/lương ra .xls
src/               React 19 + Vite + TypeScript
  components/      design system, modal/sheet, command palette, bản đồ SVG
  layouts/         khung quản trị và khung mobile
  lib/             API client, session, format, hooks, toast
  pages/admin/     9 trang quản trị
  pages/mobile/    8 trang nhân viên
tests/             test engine và test API cấp tiến trình
docs/              đặc tả thiết kế
data/              db.json + uploads (không commit)
```

---

## Bảo mật và giới hạn

### Đã có

- PIN băm bằng `scrypt` (64 byte) kèm salt ngẫu nhiên, so sánh bằng `timingSafeEqual`.
- Phiên lưu cookie `httpOnly`, `sameSite=lax`, hết hạn sau 7 ngày, token 32 byte ngẫu nhiên.
- **Khoá thiết bị:** lần đăng nhập đầu gắn tài khoản với `deviceId`; thiết bị khác nhận `423 DEVICE_LOCKED`; quản trị có thể mở khoá.
- **Giới hạn đăng nhập sai:** 5 lần trong 5 phút → `429 RATE_LIMITED` kèm `Retry-After`.
- **Chặn Origin lạ** cho mọi request ghi (POST/PATCH/PUT/DELETE), trả `403 BAD_ORIGIN`.
- Header `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`; giới hạn body JSON 4 MB; tắt `X-Powered-By`.
- Phân quyền theo vai trò và theo phạm vi quản lý ở phía server, không chỉ ẩn nút ở UI.
- Ảnh tải lên chỉ phục vụ qua `/uploads`, không index thư mục.

### Giới hạn của bản demo

- **Không phải hệ thống production:** mật khẩu/PIN ngắn, mặc định truyền qua HTTP thường (nên chạy sau HTTPS), phiên lưu trong bộ nhớ nên **mất khi restart server**.
- Dữ liệu là file JSON, không phù hợp cho tải ghi lớn hay nhiều tiến trình cùng ghi.
- Không có tính năng quên PIN tự phục vụ, không gửi email/SMS, không đồng bộ Google Sheets/Drive dù có trường cấu hình.
- Không nhận diện khuôn mặt; ảnh chấm công chỉ để đối chiếu thủ công.
- Không có CDN, không Google Maps/Geocoding, không cổng thanh toán, không gọi dịch vụ ngoài nào lúc runtime.
- Bản đồ trong mục Địa điểm là SVG tự vẽ, chỉ minh hoạ phạm vi chấm công chứ không phải bản đồ thật.
- Định vị phụ thuộc GPS trình duyệt và yêu cầu origin bảo mật (`https://` hoặc `localhost`).
- File xuất `.xls` thực chất là bảng HTML mang MIME `application/vnd.ms-excel`; Excel mở được nhưng không phải file nhị phân XLSX.
