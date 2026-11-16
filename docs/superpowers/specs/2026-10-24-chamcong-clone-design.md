# Thiết kế: tái tạo ứng dụng chấm công chamcong.worksheet.vn

Ngày: 2026-10-24 · Trạng thái: đã triển khai và xác minh

## 1. Mục tiêu

Dựng lại hai giao diện của hệ thống chấm công — trang quản trị `/app/` và ứng dụng nhân viên `/m/` — thành một demo **full-stack chạy cục bộ**, có dữ liệu mẫu và thao tác thật (chấm công, gửi đơn, duyệt đơn, xếp ca, tính lương), không phụ thuộc dịch vụ ngoài.

Phạm vi đã chốt với người yêu cầu:

- Full-stack demo: SPA React + API Node/Express, đăng nhập bằng PIN, dữ liệu seed, ghi file JSON.
- Công nghệ: React 19 + Vite 7 + TypeScript (strict) + Express 5, một package duy nhất.
- Giao diện bám sát bố cục bản gốc (đăng nhập nền xanh lá, thương hiệu công ty màu xanh dương, sidebar, thẻ KPI, lưới dữ liệu), nhưng **toàn bộ mã, số liệu, thương hiệu, font và ảnh là tự tạo**.

## 2. Ràng buộc

- Không sửa repository `rea`; sản phẩm nằm ở thư mục sibling `chamcong-clone`.
- Không CDN, không font/JS/CSS bên thứ ba lúc runtime, không Google Maps/Sheets/Drive/Geocoding, không email/SMS/thanh toán/nhận diện khuôn mặt.
- UI và tài liệu bằng tiếng Việt; định danh và đường dẫn bằng tiếng Anh.
- Xác minh giao diện bằng trình duyệt thật, không suy luận từ mã nguồn.

## 3. Kiến trúc

```
shared/types.ts    kiểu dữ liệu dùng chung
shared/domain.ts   engine chấm công thuần (không I/O)
server/            Express 5: route, auth, compute, seed, store JSON
src/               React SPA: design system + layout admin + layout mobile
data/db.json       kho dữ liệu duy nhất (ghi nguyên tử)
data/uploads/      ảnh chấm công
```

Luồng phụ thuộc đi một chiều: `shared` ← `server` ← HTTP ← `src`. Engine nằm ở `shared` nên server, seed, test và formatter phía client cùng dùng một định nghĩa, không tái tính toán.

`server/store.ts` chịu trách nhiệm đọc/ghi: `getDb` nạp hoặc seed, `mutate` tuần tự hoá mọi thao tác ghi qua một chuỗi promise rồi ghi file tạm và `rename`, tránh mất dữ liệu khi có yêu cầu đồng thời.

## 4. Xác thực và phân quyền

- Đăng nhập: mã công ty + email + PIN 4–8 chữ số, tách bề mặt `admin`/`employee`.
- PIN băm `scrypt` với muối riêng; so sánh `timingSafeEqual`.
- Phiên: cookie `cc_session` httpOnly, SameSite=Lax, TTL 7 ngày, lưu in-memory.
- Khoá thiết bị: thiết bị đầu tiên được gắn với tài khoản; thiết bị khác nhận 423 `DEVICE_LOCKED`, quản trị viên mới mở khoá được.
- Giới hạn 5 lần sai trong 5 phút cho từng (công ty, email) → 429 `RATE_LIMITED`.
- Chặn origin lạ cho mọi request có thân bài.

Vai trò: `admin` đầy đủ; `hr` như admin nhưng không sửa cài đặt hệ thống; `manager` chỉ thấy báo cáo theo cây quản lý trực tiếp, không vào lương/nhân sự/vị trí/địa điểm/cài đặt; `employee` chỉ thấy dữ liệu của mình.

## 5. Engine chấm công

`computeDay(input)` trả về trạng thái ngày, số công, phút làm việc, đi muộn/về sớm, tăng ca (đã duyệt/chờ duyệt), hệ số OT, cờ ngoài phạm vi/sai ca và danh sách vấn đề.

Các quy tắc chính:

| Nhóm | Quy tắc |
| --- | --- |
| Ca | khung giờ, nghỉ giữa ca, ca qua đêm, ca phức hợp |
| Công | `frame` (ngưỡng đủ/nửa), `actual`, `actual_late`; làm tròn 2 chữ số |
| Đi muộn | `full` (tính trọn) hoặc `excess` (trừ dung sai), có miễn trừ theo ngày |
| Tăng ca | ngưỡng chung + ngưỡng theo ca, duyệt một phần, hệ số T7/CN/lễ |
| Ngày nghỉ | lễ vẫn hưởng công, đi làm ngày lễ tính toàn bộ thời gian là OT |
| Đơn từ | nghỉ phép, đi muộn/về sớm, quên chấm, đổi ca, đăng ký ca, giải trình |
| Hôm nay | chưa tới giờ vào → "Chưa tới"; trong ca → "Đang trong ca"; chỉ quá giờ ra mới quy vắng |
| Override | quản trị viên sửa công, chấp nhận ngoài phạm vi/sai ca, miễn trừ, tắt OT |

Chấm công: trình duyệt xin định vị, server kiểm tra bán kính bằng Haversine với các địa điểm của vị trí công việc, có thể yêu cầu ảnh, rồi ghi lần chấm kèm toạ độ, độ chính xác và khoảng cách.

## 6. Giao diện

**Quản trị (9 trang):** Bảng điều phối công việc (duyệt đơn/tăng ca/giải trình), Bảng công tháng (lưới nhân viên × ngày, chi tiết ngày, điều chỉnh, xuất CSV), Xếp ca (tuần, sao chép, rải ca, đăng ký ca), Lương (tính thưởng/phạt, công bố/thu hồi, phiếu chi tiết), Nhân sự (CRUD, import hàng loạt, đặt lại PIN, mở khoá thiết bị), Vị trí (bậc lương, phụ cấp, ca, ngày phép), Địa điểm (toạ độ, bán kính, bản đồ SVG tự vẽ), Cài đặt (ngày làm việc, quy tắc muộn, OT, ảnh, ngày chốt lương, thương hiệu).

**Nhân viên (8 trang):** Tổng quan + chấm công, Bảng công (lịch tháng, chi tiết ngày, gửi giải trình/báo quên), Lịch ca tuần, Đơn từ (danh sách, chi tiết, soạn 7 loại đơn kèm kiểm tra dữ liệu), Phiếu lương danh sách, Phiếu lương chi tiết, Thông báo (đánh dấu đã đọc), Hồ sơ (thiết bị, quyền lợi, đăng xuất).

Mobile dùng shell 480px, tab bar 5 mục với nút chấm công ở giữa; sheet bottom-sheet cho biểu mẫu và chi tiết.

## 7. Kiểm thử và xác minh

- `tests/domain.test.ts` — 35 kiểm tra engine: đủ công, đi muộn hai chế độ, về sớm, thiếu chấm, vắng mặt, hôm nay theo ba mốc thời gian, tăng ca một phần/toàn bộ/qua đêm, ca đêm, nghỉ phép, ngày lễ, đổi ca, override, helper thời gian, kiểm tra dữ liệu đơn.
- `tests/api.test.ts` — 18 kiểm tra ở cấp tiến trình: khởi động `server/index.ts` thật bằng `tsx` với `DATA_DIR` tạm, đo health, 404, chặn origin, 401 khi chưa đăng nhập, PIN sai định dạng, thông báo đăng nhập không lộ tài khoản, rate limit 429, gắn thiết bị, khoá thiết bị 423, RBAC 403, chu trình chấm vào/ra/chặn trùng, từ chối ngoài phạm vi, gửi–duyệt–thông báo đơn, validate phía server, HR không sửa cài đặt, thu hồi phiên, và **dữ liệu còn nguyên sau khi tắt/bật lại tiến trình**.
- `npm run typecheck` sạch cho cả hai tsconfig; `npm run build` tạo bundle production.
- Xác minh trình duyệt bằng Playwright ở 390×844 (nhân viên) và desktop (quản trị): đăng nhập, chấm vào và chấm ra với định vị giả lập tại trụ sở, bảng công và chi tiết ngày, lịch tuần, danh sách/chi tiết/soạn đơn (cả nhánh lỗi validate), phiếu lương, thông báo, hồ sơ, đăng xuất và redirect. Không có lỗi console.
- Docker: `docker build` thành công, container chạy bằng volume tạm trả về `/api/health` 200, tải trang `/m/login` và `/login` hiển thị đúng, không lỗi page.

## 8. Kết luận và hướng phát triển

Demo đã phủ hai bề mặt, engine và vòng đời dữ liệu. Điểm còn đơn giản hoá có chủ đích: phiên lưu in-memory nên mất khi restart (dữ liệu nghiệp vụ thì vẫn còn), định vị do trình duyệt cung cấp nên giả lập được, và chưa có hàng đợi/lịch chạy tự động cho tính lương cuối kỳ.
