# Multi-Account Fraud Detection Platform

Đồ án môn **Phát triển phần mềm hướng dịch vụ (SOA)**.

Hệ thống phát hiện lạm dụng trial đa tài khoản bằng browser fingerprinting, graph analysis và auto decision.

## Trạng thái

- [x] M0 — Cài môi trường (Node, Docker, Git, VS Code)
- [ ] M1 — Bộ xương 3 service + gateway + health
- [ ] M2 — S1 Account & Trial
- [ ] M3 — S2 Graph & Risk tối giản
- [ ] M4 — Auto policy + OTP
- [ ] M5 — RabbitMQ + S3 Case
- [ ] M6 — S2 nâng cao D/N/I/V
- [ ] M7 — Reliability + fault tests
- [ ] M8 — UI, OpenAPI, Postman, CI, báo cáo

## Kiến trúc mục tiêu

```text
Browser → NGINX Gateway
              ├── S1 Account & Trial   (PostgreSQL)
              ├── S2 Graph & Risk      (Neo4j)
              └── S3 Fraud Case        (PostgreSQL)

S1 → REST → S2 (risk assessment)
S3 → REST → S2 (graph)
S1 → RabbitMQ → S2/S3 (events)
```

## Cấu trúc repo

```text
apps/
  account-trial-service/   # S1
  graph-risk-service/      # S2
  fraud-case-service/      # S3
  web/                     # React
infra/
  nginx/                   # Gateway config
  postgres/init/           # Tạo 2 database + user
docs/                      # Tài liệu thiết kế (nếu tách riêng)
```

## Yêu cầu môi trường

- Node.js 24 LTS
- npm
- Docker Engine + Docker Compose
- Git

Kiểm tra:

```bash
node -v
npm -v
docker --version
docker compose version
```

## Chạy dự án

Sẽ cập nhật ở M1:

```bash
cp .env.example .env
docker compose up --build
```

## Tài liệu thiết kế

- `Thiet_ke_he_thong_phat_hien_gian_lan_da_tai_khoan_v4_auto100.md` — bản chốt
- `S3_Case_Investigation_Service.md` — đặc tả S3
- `M0_CHECKLIST.md` — checklist môi trường

## Ghi chú

- Không commit file `.env`.
- Không commit `node_modules/`.
- Không query database của service khác.
