# Explanations

Thư mục này chỉ chứa **tài liệu giải thích do người dùng yêu cầu tạo**:

- File `.html` để đọc trực quan.
- File `.md` để đọc nhanh trong editor/Git.
- Không chứa code, cấu hình, Dockerfile, migration hay tài liệu thiết kế gốc.

## Quy ước

- Tên file: `chu-de-ngan-gon.html` hoặc `chu-de-ngan-gon.md`.
- Mỗi file nên có tiêu đề, ngày cập nhật, và liên kết tới file liên quan nếu cần.
- Nội dung ưu tiên: giải thích dễ hiểu, ví dụ cụ thể, sơ đồ/bảng nếu cần.
- Không đưa secret, mật khẩu hay dữ liệu cá nhân thật vào đây.

## Phong cách thiết kế HTML

Mỗi tài liệu HTML mới chọn ngẫu nhiên một phong cách brand trong `brand-styles.md`:

```bash
grep '^### ' explanations/brand-styles.md | shuf -n 1
```

Ghi tên brand đã dùng ở cuối trang (footer) và trong bảng danh sách bên dưới. Nếu brand vừa chọn trùng với tài liệu gần nhất, chọn lại để tài liệu đa dạng hơn.

## Danh sách

| File | Nội dung | Phong cách |
|---|---|---|
| `s1-database-design.html` | Thiết kế database S1: bảng, cột, ERD, state machine, idempotency, Q&A bảo vệ | Dashboard kỹ thuật |
| `s1-auth-register.html` | Đăng ký tài khoản: DTO, ValidationPipe, chuẩn hóa email, hash bcrypt, lỗi 409 | Apple |
| `s1-auth-login-jwt.html` | Đăng nhập, cấu trúc JWT, ký token, lỗi 401, payload và các quyết định bảo mật | GitHub (dark) |
| `s1-auth-guard-me.html` | JwtAuthGuard, `@CurrentUser`, `GET /api/users/me`, lỗi 401 và luồng bảo vệ route | Discord (dark) |
| `s1-trials-campaigns.html` | `GET /api/trials/campaigns`: lọc campaign active, select tối thiểu, route được bảo vệ | Netflix |
| `s1-trials-claim.html` | `POST /api/trials/claims`: idempotency, transaction claim + outbox, lỗi 400/409/422 | Dropbox |
| `s1-trials-risk-assessment.html` | Bản đồ toàn bộ file S1 + S2, S1 gọi S2, internal token, timeout, xử lý lỗi, so sánh HTTP vs RabbitMQ | IBM (Carbon) |
| `brand-styles.md` | Danh sách 30 phong cách thương hiệu để chọn ngẫu nhiên | — |
