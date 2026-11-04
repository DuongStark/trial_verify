# THIẾT KẾ HỆ THỐNG PHÁT HIỆN GIAN LẬN ĐA TÀI KHOẢN
## Phiên bản v4 — Auto 100% + Case Investigation

**Tên tiếng Anh:** Multi-Account Fraud Detection System with Browser Fingerprinting, Graph Analysis and Auto-Triage  
**Phiên bản:** 4.1 — đã sửa theo rà soát  
**Ngày:** 04/11/2026  
**Môn học:** Phát triển phần mềm hướng dịch vụ (SOA)  
**Quy mô:** Nhóm 2 sinh viên, 8 tuần, MVP đồ án  
**Trạng thái:** Thiết kế đã chốt — chưa triển khai code

---

## 0. TÓM TẮT ĐIỀU HÀNH

### 0.1. Hệ thống làm gì?

Một công ty cung cấp ứng dụng AI có gói Premium dùng thử 7 ngày. Kẻ gian tạo nhiều tài khoản để nhận trial liên tục. Hệ thống phát hiện các tài khoản có dấu hiệu thuộc cùng một cụm lạm dụng, rồi tự động:

- Cho qua nếu rủi ro thấp.
- Yêu cầu xác minh nếu rủi ro trung bình.
- Từ chối trial nếu rủi ro cao.
- Ghi hồ sơ điều tra nếu cần.

**Không có admin duyệt trong luồng chính.** Đây là auto 100%.

> **Lưu ý cách hiểu:** “Auto 100%” nghĩa là **tự động hóa luồng quyết định**, không phải hệ thống phát hiện gian lận chính xác 100%. Dữ liệu giả lập chỉ chứng minh hành vi theo các kịch bản đã thiết kế.

### 0.2. Ba service

| Service | Câu hỏi nghiệp vụ | Dữ liệu |
|---|---|---|
| **S1 — Account & Trial** | Ai được dùng trial? Trial đang ở trạng thái nào? | PostgreSQL `account_trial_db` |
| **S2 — Graph & Risk** | Claim này đáng ngờ không? Có liên quan tài khoản nào? | Neo4j |
| **S3 — Fraud Case & Investigation** | Hồ sơ này thuộc cụm nào, ưu tiên ra sao, lưu vết thế nào? | PostgreSQL `fraud_case_db` |

### 0.3. Quyết định quan trọng đã chốt

1. **3 service**, không gộp S3 trong MVP.
2. **Auto 100%**: LOW → ACTIVE; MEDIUM → OTP → tự quyết; HIGH → REJECT mềm.
3. **Không manual review** trong critical path.
4. **S3 là Case & Investigation Service**, không phải hàng đợi duyệt tay.
5. **S2 dùng 4 nhóm bằng chứng D/N/I/V**, có rarity + time decay + `device_stability` do server tự tính.
6. **Không ML, không GDS, không WCC/Louvain** trong MVP.
7. **Không shared database**; mỗi service sở hữu store riêng.
8. **REST cho việc cần trả lời ngay**; **RabbitMQ cho việc không cần chờ**.
9. **Outbox chỉ ở S1**; **inbox ở S2/S3**; không S3 outbox, không S1 inbox.
10. **Soft reject**: từ chối trial, không khóa tài khoản.

### 0.4. Phạm vi không làm

- Xác định danh tính thực của một con người.
- Theo dõi người dùng trên website khác.
- Thu thập IMEI, MAC address, serial phần cứng.
- Thanh toán thật, KYC thật.
- ML production, xử lý hàng triệu sự kiện/giây.
- Auto-ban vĩnh viễn.
- WCC/Louvain/GDS.
- Redis/Kafka.
- JWT tại Gateway (điểm cộng nhỏ, không đáng thời gian).

### 0.5. Các điểm đã sửa sau rà soát v4.1

| Điểm rà soát | Cách sửa trong v4.1 |
|---|---|
| Công thức điểm/decision mâu thuẫn | Chốt một `decision function` duy nhất ở mục 4.5 và 7.9 |
| Ví dụ JSON sai điểm | Sửa score 62.5 → 63; decision REJECT vì D,V >= 60 |
| OTP/S2 timeout sau verify chưa rõ | Thêm `verification_state`, `risk_check_context=POST_VERIFY`; không gửi OTP lại |
| OTP sai hết lượt mơ hồ | Chốt `REJECTED`; hết hạn xác minh → `CANCELLED` |
| S3 event sai thứ tự | Thêm `claim_event_state`; event cũ không ghi đè state nhưng vẫn bổ sung case CLOSED nếu thiếu |
| Ghép cụm theo campaign quá rộng | Campaign chỉ là phạm vi; link cần user/graph evidence |
| Thiếu `next_enrich_at` | Bổ sung schema + worker |
| Severity còn dùng F1/F2/F5 | Chuyển sang `risk_level` + related cases + `strong_group_count` |
| Append-only dễ hiểu nhầm | Case row được update; chỉ `case_events`/audit là bất biến |
| Dataset 400 bị cộng lệch | 240 + 80 + 80, 40 evasive là tập con |
| Feature normalization chưa rõ | Thêm bảng công thức, cửa sổ thời gian, cách đếm |
| Client fingerprint confidence bị tin | Bỏ khỏi decision; dùng `device_stability` server-side; ghi rõ giới hạn cap D |
| Disposable + velocity chưa khớp | Sửa mô tả: disposable một mình chỉ VERIFY; REJECT cần đủ hàm quyết định |
| Worker enrichment bị kẹt NULL/PARTIAL | `next_enrich_at NOT NULL DEFAULT now()`; worker chọn cả PENDING và PARTIAL |
| Ví dụ số cũ | Sửa activated 28→7, rejected 78→63, rarity 0,90→0,84 |
| OpenAPI/test dồn cuối | Làm cùng service; kế hoạch 8 tuần đã sửa |

---

## 1. BỐI CẢNH, TÁC NHÂN VÀ MỤC TIÊU

### 1.1. Bài toán

Công ty có chương trình dùng thử 7 ngày. Mỗi người chỉ nên nhận một lần. Kẻ gian có thể:

- Tạo nhiều tài khoản từ cùng trình duyệt/thiết bị.
- Dùng email disposable hoặc alias Gmail.
- Dùng nhiều IP/proxy để tránh bị phát hiện.
- Đăng ký hàng loạt trong thời gian ngắn.
- Dùng lại fingerprint hoặc mạng của trường/công ty.

Hệ thống cần phát hiện **cụm tài khoản lạm dụng**, không phải khẳng định “hai tài khoản là cùng một người”.

### 1.2. Tác nhân

| Tác nhân | Mô tả |
|---|---|
| Guest | Đăng ký tài khoản |
| User | Đăng nhập, yêu cầu trial, xác minh OTP, xem trạng thái |
| Admin | Xem dashboard, case, graph; **không duyệt trial** trong MVP |
| System | Thu tín hiệu, chấm điểm, tự quyết định, ghi case, gửi event |
| Developer | Chạy seed, Postman, fault test, CI |

### 1.3. Mục tiêu kinh doanh

- Giảm trial abuse.
- Không từ chối oan người dùng hợp lệ.
- Giải thích được vì sao một claim bị từ chối.
- Có hồ sơ/audit để điều tra.
- Demo chạy ổn định, tự động, không phụ thuộc thao tác admin.

### 1.4. Mục tiêu kỹ thuật

- 3 service độc lập, dữ liệu riêng.
- API Gateway duy nhất.
- REST + RabbitMQ.
- Timeout, retry, PENDING, idempotency, DLQ.
- Docker Compose một lệnh.
- OpenAPI 3 file.
- Postman ≥10 request.
- ≥2 fault test có số liệu.

### 1.5. Định nghĩa “không hợp lệ”

Trong đồ án này, “không hợp lệ” không có nghĩa là “người dùng giả”. Nó có nghĩa là:

> Tài khoản/claim có xác suất cao thuộc một cụm lạm dụng trial, dựa trên nhiều bằng chứng độc lập.

Các loại cần phân biệt:

- **Multi-account abuse:** nhiều tài khoản cùng người/vận hành.
- **Disposable identity:** email dùng một lần, alias, role account.
- **Automation/bot:** đăng ký/claim hàng loạt.
- **Promo/trial farming:** nhận trial lặp, chuyển campaign.
- **Network sharing:** IP chung hợp lệ (trường, công ty, gia đình).

---

## 2. YÊU CẦU ĐỀ BÀI VÀ CÁCH ĐÁP ỨNG

### 2.1. Giả định về quy mô nhóm

Tài liệu này giả định **nhóm 2 sinh viên**. Đề bài yêu cầu:

| Quy mô nhóm | Số service nghiệp vụ tối thiểu |
|---|---:|
| 1–2 người | 2 |
| 3–4 người | 3 |
| 5 người | 4 |

Thiết kế dùng **3 service**, vượt mức tối thiểu cho nhóm 2 người. Nếu nhóm thực tế 5 người, cần bổ sung service thứ 4.

### 2.2. Ma trận đáp ứng

| # | Yêu cầu | Cách đáp ứng | Trạng thái thiết kế |
|---|---|---|---|
| 1 | Bài toán, người dùng, ≥5 quy tắc | Mục 1, 4; BR-S1/S2/S3 | Đã thiết kế |
| 2 | Service tối thiểu theo quy mô, code + data riêng | S1, S2, S3; 3 store riêng | Đã thiết kế |
| 3 | Mỗi service ≥4 REST endpoint, ≥1 lỗi nghiệp vụ 4xx, OpenAPI | S1 8+, S2 8, S3 6; 3 file YAML | Đã thiết kế |
| 4 | API Gateway duy nhất, không nghiệp vụ | NGINX | Đã thiết kế |
| 5 | Timeout/retry, 4xx vs 503/504, env, `/health` | Mục 7, 10, 12 | Đã thiết kế |
| 6 | Luồng ≥2 service, xử lý lỗi/PENDING | Claim → Risk → Case; PENDING_RISK_CHECK | Đã thiết kế |
| 7 | Dockerfile từng service + compose một lệnh | Mục 17 | Đã thiết kế |
| 8 | Postman ≥10 request + ≥2 fault test có số liệu | Mục 15, 16 | Đã thiết kế |
| Bonus | RabbitMQ luồng phụ + idempotent + DLQ | Audit/case consumer | Đã thiết kế |
| Bonus | JWT tại Gateway | Không làm | Out of scope |
| Bonus | Circuit Breaker | S1 → S2 | Đã thiết kế |
| Bonus | CI | GitHub Actions | Đã thiết kế |
| Báo cáo | PDF ≥30 trang, slide ≤10 | Mục 18 | Kế hoạch |
| Demo | Chạy trên máy nhóm, trực tiếp | Auto script + seed | Kế hoạch |

### 2.3. Sản phẩm nộp

- Source Git.
- 3 OpenAPI YAML.
- Postman collection.
- Docker Compose chạy một lệnh.
- Báo cáo PDF ≥30 trang.
- Slide ≤10.
- Khai báo sử dụng AI.
- Demo trực tiếp.

---

## 3. THUẬT NGỮ VÀ NGUYÊN TẮC

### 3.1. Thuật ngữ

| Thuật ngữ | Nghĩa dễ hiểu |
|---|---|
| Claim | Yêu cầu nhận trial của một user cho một campaign |
| Assessment | Kết quả chấm điểm rủi ro của S2 cho một claim/version |
| Case | Hồ sơ điều tra do S3 tạo sau quyết định |
| Cluster | Nhóm case/tài khoản có liên quan |
| Severity | Mức ưu tiên điều tra P1/P2/P3 |
| Fingerprint | Dấu hiệu trình duyệt/thiết bị, không phải danh tính |
| HMAC | Hash có khóa bí mật, dùng để không lưu dữ liệu thô |
| Rarity | Độ hiếm của tín hiệu; tín hiệu hiếm có giá trị hơn |
| Time decay | Tín hiệu gần đây quan trọng hơn tín hiệu cũ |
| Device stability | Độ ổn định của fingerprint do S2 tự tính từ lịch sử quan sát; không dùng confidence do client gửi |
| Outbox | Bảng ghi event cùng transaction nghiệp vụ để không mất event |
| Inbox | Bảng ghi event đã xử lý để không xử lý trùng |
| Idempotent | Gọi lặp vẫn chỉ có một kết quả |
| Projection | Bản sao dữ liệu tối thiểu để service khác đọc |
| DLQ | Dead Letter Queue — nơi message lỗi được giữ lại |
| PENDING | Đã nhận nhưng chưa có kết quả cuối |
| Soft reject | Từ chối trial nhưng không khóa tài khoản |
| Append-only | Chỉ ghi thêm, không sửa/xóa |
| JWT | Token đăng nhập |
| Circuit breaker | Cầu dao tự ngắt khi dependency lỗi liên tục |

### 3.2. Nguyên tắc

1. **Không tín hiệu đơn lẻ nào đủ kết luận gian lận.**
2. **Mỗi service sở hữu dữ liệu của mình.** Không query DB service khác.
3. **REST khi cần trả lời ngay; RabbitMQ khi không cần chờ.**
4. **Auto 100% ở tầng quyết định**, nhưng vẫn có audit và explainability.
5. **Soft reject**, không auto-ban.
6. **Idempotent** ở mọi nơi có thể lặp.
7. **PENDING thay vì rollback phân tán.**
8. **Không dùng ML/GNN** khi dữ liệu nhỏ và cần giải thích.
9. **Privacy-by-design**: HMAC, tối thiểu PII, retention.
10. **Đo lường, không tuyên bố suông.**

---

## 4. MÔ HÌNH NGHIỆP VỤ VÀ TRẠNG THÁI

### 4.1. Use case chính

| ID | Use case | Tác nhân |
|---|---|---|
| UC-01 | Đăng ký tài khoản | Guest |
| UC-02 | Đăng nhập | User |
| UC-03 | Xem campaign | User |
| UC-04 | Yêu cầu trial | User |
| UC-05 | Hệ thống chấm điểm rủi ro | System |
| UC-06 | Tự động cấp/verify/reject trial | System |
| UC-07 | Xác minh OTP | User |
| UC-08 | Xem trạng thái trial | User |
| UC-09 | Tạo case điều tra | System |
| UC-10 | Ghép cụm case | System |
| UC-11 | Xem case/dashboard/graph | Admin |
| UC-12 | Xem audit | Admin |
| UC-13 | Chạy fault test/demo | Developer |

### 4.2. Trạng thái TrialClaim

```mermaid
stateDiagram-v2
    [*] --> PENDING_RISK_CHECK: claim
    PENDING_RISK_CHECK --> ACTIVE: ALLOW
    PENDING_RISK_CHECK --> VERIFY_REQUIRED: VERIFY
    PENDING_RISK_CHECK --> REJECTED: REJECT
    VERIFY_REQUIRED --> ACTIVE: OTP + ALLOW/VERIFY
    VERIFY_REQUIRED --> REJECTED: OTP + REJECT
    VERIFY_REQUIRED --> CANCELLED: hết hạn xác minh
    ACTIVE --> EXPIRED: hết hạn trial
    REJECTED --> [*]
    EXPIRED --> [*]
    CANCELLED --> [*]
```

Không có `PENDING_REVIEW` trong MVP.

### 4.3. Trạng thái FraudCase

```mermaid
stateDiagram-v2
    [*] --> OPEN: tạo case
    OPEN --> CLOSED: hết retention
    OPEN --> CLOSED: trial expired
```

Case không có quyết định duyệt/từ chối. Nó là hồ sơ.

### 4.4. Trạng thái enrichment

| Trạng thái | Nghĩa |
|---|---|
| `PENDING` | Chưa enrich |
| `PARTIAL` | Enrich một phần |
| `DONE` | Đã enrich |
| `FAILED` | Retry quá số lần |

### 4.5. Auto decision function — nguồn chân lý duy nhất

Không dùng một bảng score đơn lẻ để quyết định. Dùng đúng một hàm:

```text
R = 0.40*D + 0.15*N + 0.20*I + 0.25*V

strongGroups = count(D >= 60, I >= 60, V >= 60)

1. REJECT nếu R >= 40 và strongGroups >= 2
2. VERIFY nếu R >= 30 hoặc max(D, I, V) >= 60
3. ALLOW nếu còn lại
```

`level` suy ra từ decision, không suy từ score:

| Decision | Level | Claim status | Case |
|---|---|---|---|
| `ALLOW` | LOW | `ACTIVE` | Không tạo case |
| `VERIFY` | MEDIUM | `VERIFY_REQUIRED` | Tạo case sau kết quả cuối |
| `REJECT` | HIGH | `REJECTED` | Tạo case |

Quy tắc bổ sung:

- `REJECT` cần **≥2 nhóm D/I/V >= 60** và `R >= 40`.
- Chỉ network mạnh → tối đa `VERIFY`.
- `device_stability` thấp → cap D = 30, không đủ `REJECT` một mình.
- Sau OTP, nếu S2 trả `VERIFY` → `ACTIVE` + `monitored=true` (không hỏi OTP lần hai).
- Sau OTP, nếu S2 trả `REJECT` → `REJECTED`.
- `score` chỉ là số hiển thị; **decision function** mới là quyết định cuối.

### 4.6. Business rules

#### S1 — Account & Trial

| Mã | Quy tắc |
|---|---|
| BR-S1-01 | Email chuẩn hóa là duy nhất. |
| BR-S1-02 | Mỗi user tối đa một claim/campaign. |
| BR-S1-03 | Claim phải có `Idempotency-Key`; cùng key + cùng payload trả cùng claim. |
| BR-S1-04 | Key khác cho user/campaign đã claim → 409. |
| BR-S1-05 | Không cấp trial khi chưa có risk assessment. |
| BR-S1-06 | S2 lỗi → giữ `PENDING_RISK_CHECK`, trả 202, retry. |
| BR-S1-07 | Decision ALLOW → ACTIVE; VERIFY → VERIFY_REQUIRED; REJECT → REJECTED. |
| BR-S1-08 | OTP đúng → tăng `evaluationVersion`, gọi lại S2 một lần; đánh dấu `verification_state=VERIFIED`. |
| BR-S1-09 | OTP sai quá N lần → `REJECTED`; hết hạn xác minh → `CANCELLED`. |
| BR-S1-10 | ACTIVE quá hạn → EXPIRED + event. |
| BR-S1-11 | Mọi thay đổi quan trọng ghi outbox trong cùng transaction. |
| BR-S1-12 | Không tự cấp trial khi S2 down. |

#### S2 — Graph & Risk

| Mã | Quy tắc |
|---|---|
| BR-S2-01 | Fingerprint/IP phải HMAC trước khi lưu. |
| BR-S2-02 | Không tạo node null cho fingerprint thiếu. |
| BR-S2-03 | Assessment idempotent theo `claimId:evaluationVersion`. |
| BR-S2-04 | Tín hiệu phổ biến phải giảm điểm theo rarity. |
| BR-S2-05 | Tín hiệu cũ giảm điểm theo time decay. |
| BR-S2-06 | `device_stability` thấp phải bị cap D = 30; không dùng confidence do client gửi để quyết định. |
| BR-S2-07 | Không REJECT nếu chỉ có network signal. |
| BR-S2-08 | REJECT cần ≥2 nhóm D/I/V mạnh. |
| BR-S2-09 | Graph query có depth/node/edge limit. |
| BR-S2-10 | Không đọc DB S1/S3. |
| BR-S2-11 | Assessment cũ không bị ghi đè. |
| BR-S2-12 | Trả reason codes + group scores. |

#### S3 — Fraud Case & Investigation

| Mã | Quy tắc |
|---|---|
| BR-S3-01 | Mỗi claim tối đa một case; `claim_id` unique. |
| BR-S3-02 | Chỉ tạo case từ quyết định cuối. |
| BR-S3-03 | `case_events` và audit append-only; bảng `fraud_cases` được cập nhật trạng thái/severity/enrichment. |
| BR-S3-04 | S2 lỗi không làm mất case; enrichment `PENDING`. |
| BR-S3-05 | Case liên quan trong 30 ngày thì ghép cụm. |
| BR-S3-06 | Severity P1/P2/P3 chỉ để ưu tiên điều tra. |
| BR-S3-07 | Case tự đóng theo retention. |
| BR-S3-08 | Chỉ ADMIN xem case detail. |
| BR-S3-09 | Event lặp không tạo case trùng. |
| BR-S3-10 | Không có endpoint quyết định trial. |
| BR-S3-11 | Graph view lỗi S2 → 503/504. |
| BR-S3-12 | Không đọc DB S1/S2. |

---

## 5. KIẾN TRÚC TỔNG THỂ

### 5.1. Sơ đồ

```mermaid
flowchart TB
    FE[React + FingerprintJS] --> GW[NGINX Gateway]
    GW --> S1[S1 Account & Trial]
    GW --> S2[S2 Graph & Risk]
    GW --> S3[S3 Fraud Case]

    S1 -->|REST - risk| S2
    S3 -->|REST - graph| S2

    S1 --> PG1[(PostgreSQL account_trial_db)]
    S2 --> NEO[(Neo4j)]
    S3 --> PG3[(PostgreSQL fraud_case_db)]

    S1 -->|Outbox publisher| MQ[(RabbitMQ)]
    MQ -->|account.registered / trial.*| S2
    MQ -->|trial.* / claim_audit| S3
```

### 5.2. Service table

| Service | Trách nhiệm | Store | Giao tiếp |
|---|---|---|---|
| S1 | Account, auth, campaign, claim, auto policy, expiry, outbox | PostgreSQL | REST → S2; RabbitMQ producer |
| S2 | Fingerprint/IP graph, risk assessment, projections, graph API | Neo4j | REST ← S1/S3; RabbitMQ consumer |
| S3 | Case, cluster, severity, audit, retention, dashboard | PostgreSQL | REST → S2; RabbitMQ consumer |
| Gateway | Routing, CORS, rate limit, timeout | Không DB | Proxy |

### 5.3. Vì sao 3 service?

- **S1** giữ giao dịch trial, unique claim, idempotency, auto policy. Cần ACID.
- **S2** giữ graph/risk. Cần truy vấn quan hệ, Neo4j phù hợp.
- **S3** giữ case/audit/retention/dashboard. Cần dữ liệu quan hệ, lịch sử event/audit bất biến, vòng đời dài.
- Ba service có **dữ liệu, vòng đời, kiểu truy vấn, cách lỗi** khác nhau.

Nếu gộp S3 vào S1:

- Ít service hơn, dễ làm hơn.
- Mất tách biệt case/audit/cluster.
- Đề nhóm 2 người chỉ yêu cầu tối thiểu 2 service, nên gộp vẫn đạt.
- Chỉ nên gộp nếu S3 chỉ read-only. Bản này có auto-triage nên giữ được.

### 5.4. Source of truth

| Dữ liệu | Source of truth |
|---|---|
| Account, campaign, claim status | S1 |
| Fingerprint/IP graph, assessment | S2 |
| Case, cluster, severity, audit | S3 |

Không service nào query DB của service khác.

---

## 6. S1 — ACCOUNT & TRIAL SERVICE

### 6.1. Trách nhiệm

- Đăng ký, đăng nhập, JWT.
- Quản lý campaign.
- Tạo claim, idempotency.
- Gọi S2, áp dụng auto policy.
- OTP verification.
- Retry worker cho claim PENDING.
- Expiry worker.
- Outbox publisher.

### 6.2. Data model

```sql
CREATE TABLE accounts (
  user_id UUID PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  email_domain_key TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trial_campaigns (
  campaign_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_days INT NOT NULL CHECK (duration_days > 0),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE trial_claims (
  claim_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES accounts(user_id),
  campaign_id TEXT NOT NULL REFERENCES trial_campaigns(campaign_id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  evaluation_version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN (
    'PENDING_RISK_CHECK','VERIFY_REQUIRED','ACTIVE','REJECTED','EXPIRED','CANCELLED'
  )),
  assessment_id TEXT,
  risk_score INT,
  risk_level TEXT,
  decision TEXT,
  reasons_json JSONB NOT NULL DEFAULT '[]',
  monitored BOOLEAN NOT NULL DEFAULT false,
  verification_state TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (verification_state IN ('NOT_REQUIRED','PENDING','VERIFIED','FAILED','EXPIRED')),
  verification_attempts INT NOT NULL DEFAULT 0,
  verification_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  risk_check_context TEXT NOT NULL DEFAULT 'INITIAL'
    CHECK (risk_check_context IN ('INITIAL','POST_VERIFY')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status_expires_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  version INT NOT NULL DEFAULT 0,
  UNIQUE(user_id, campaign_id),
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX idx_claims_pending
  ON trial_claims(status, next_retry_at)
  WHERE status = 'PENDING_RISK_CHECK';

CREATE TABLE s1_outbox (
  event_id UUID PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  aggregate_version INT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_new
  ON s1_outbox(status, next_retry_at)
  WHERE status = 'NEW';
```

### 6.3. API

| Method | Endpoint | Auth | Thành công | Lỗi nghiệp vụ |
|---|---|---|---|---|
| POST | `/api/auth/register` | public | 201 | 409 `EMAIL_ALREADY_EXISTS` |
| POST | `/api/auth/login` | public | 200 | 401 `INVALID_CREDENTIALS` |
| GET | `/api/users/me` | USER | 200 | 401 |
| GET | `/api/trials/campaigns` | USER | 200 | 401 |
| POST | `/api/trials/claims` | USER | 201/202 | 409 `TRIAL_ALREADY_CLAIMED`, 409 `IDEMPOTENCY_KEY_REUSED`, 422 `CAMPAIGN_INACTIVE` |
| GET | `/api/trials/claims/{claimId}` | USER | 200 | 403 `CLAIM_NOT_OWNED`, 404 |
| POST | `/api/trials/claims/{claimId}/verifications` | USER | 202 | 422 `INVALID_VERIFICATION_CODE`, 409 `CLAIM_NOT_AWAITING_VERIFICATION` |
| GET | `/api/admin/stats` | ADMIN | 200 | 403 |
| GET | `/health` | public | 200 | — |
| GET | `/ready` | public | 200 | 503 |

### 6.4. Claim flow

1. Validate JWT, campaign, account.
2. Compute `request_hash = SHA256(campaignId)`.
3. `INSERT ... ON CONFLICT (user_id,campaign_id) DO NOTHING`.
4. Nếu conflict:
   - Cùng `user_id + idempotency_key` và cùng `request_hash` → trả claim cũ.
   - Cùng user/campaign nhưng key khác → 409 `TRIAL_ALREADY_CLAIMED`.
   - Cùng key nhưng hash khác → 409 `IDEMPOTENCY_KEY_REUSED`.
5. Tạo claim `PENDING_RISK_CHECK` + outbox audit trong cùng transaction.
6. Gọi S2 `POST /internal/risk/assessments`.
7. Áp dụng kết quả:
   - ALLOW → ACTIVE + outbox `trial.activated`.
   - VERIFY → VERIFY_REQUIRED + lưu OTP.
   - REJECT → REJECTED + outbox `trial.rejected`.
8. Trả 201 nếu terminal, 202 nếu pending/verify.

### 6.5. Idempotency

- `Idempotency-Key` bắt buộc.
- `request_hash` chỉ hash `{campaignId}`. Không đưa `visitorId` vào hash vì fingerprint có thể đổi giữa hai lần retry.
- Cùng key + cùng hash → trả claim hiện tại.
- Cùng key + khác hash → 409.
- Cùng user/campaign + key khác → 409.

### 6.6. Auto policy

```text
S2 decision ALLOW  -> ACTIVE
S2 decision VERIFY -> VERIFY_REQUIRED
S2 decision REJECT -> REJECTED (soft)
```

Sau OTP thành công:

```text
verification_state = VERIFIED
status = PENDING_RISK_CHECK
evaluation_version += 1
risk_check_context = POST_VERIFY

S2 ALLOW  -> ACTIVE
S2 VERIFY -> ACTIVE + monitored=true
S2 REJECT -> REJECTED
```

Quy tắc bắt buộc:

- Worker phải thấy `risk_check_context=POST_VERIFY` để **không gửi OTP lại**.
- Nếu S2 timeout sau OTP: giữ `PENDING_RISK_CHECK`, retry; không quay lại `VERIFY_REQUIRED`.
- Kết quả assessment cũ chỉ được áp dụng nếu:
  - `assessment.evaluationVersion == claim.evaluation_version`
  - `claim.status == PENDING_RISK_CHECK`
  - `claim.version == expectedVersion`
- Kết quả đến muộn/khác version bị bỏ qua, ghi log `STALE_ASSESSMENT_IGNORED`.

### 6.7. OTP

- 6 chữ số.
- TTL 10 phút.
- Max 5 lần thử.
- Lưu hash, không lưu plaintext.
- Demo: `OTP_FIXED_CODE=123456` hoặc `DEMO_AUTO_VERIFY=true`.
- OTP không chứng minh danh tính; chỉ là friction.
- Claim có thêm:
  - `verification_state`: `NOT_REQUIRED | PENDING | VERIFIED | FAILED | EXPIRED`
  - `verification_attempts`
  - `verification_expires_at`
- Hai request verify đồng thời:
  - Dùng `SELECT ... FOR UPDATE` hoặc compare-and-set trên `status=VERIFY_REQUIRED` và `verification_state=PENDING`.
  - Chỉ một request được tăng `evaluation_version`.
  - Request còn lại trả 409 `VERIFICATION_ALREADY_IN_PROGRESS` hoặc trạng thái hiện tại.
- OTP sai hết lượt:
  - `verification_state=FAILED`
  - claim `REJECTED`
  - `trial.rejected` event với reason `VERIFICATION_FAILED`.
- Hết hạn xác minh:
  - `verification_state=EXPIRED`
  - claim `CANCELLED`
  - chỉ audit, không tạo case fraud.

### 6.8. Retry worker

- Quét `PENDING_RISK_CHECK` có `next_retry_at <= now()`.
- Gọi S2 cùng `assessmentKey`.
- Backoff: 5s, 15s, 60s, 5m, 15m.
- Sau `max_attempts`: giữ PENDING, tăng backoff, ghi metric/alert. Không auto-allow.
- Nếu `risk_check_context=POST_VERIFY`: không gửi OTP lại; khi S2 trả về, áp dụng policy post-verify.
- Khi S2 phục hồi, worker tự resolve.
- Worker cập nhật claim bằng `WHERE status = expected AND evaluation_version = expected AND version = expectedVersion`; nếu 0 hàng bị ảnh hưởng, bỏ qua kết quả cũ.

### 6.9. Expiry worker

- Quét `ACTIVE` có `expires_at <= now()`.
- Chuyển `EXPIRED` + outbox `trial.expired`.
- Quét `VERIFY_REQUIRED` quá `status_expires_at` → `CANCELLED`.

### 6.10. Outbox publisher

- Poll `s1_outbox` status `NEW`.
- Gửi RabbitMQ persistent message qua `amqplib` ConfirmChannel.
- Đợi publisher confirm.
- Thành công → `SENT`; lỗi → `retry_count++`, `next_retry_at`.
- Không mark `SENT` trước confirm.

### 6.11. Failure handling

| Tình huống | Hành vi |
|---|---|
| S2 down/timeout | Giữ PENDING, trả 202, retry |
| S2 4xx nghiệp vụ | Giữ claim, không retry mù |
| RabbitMQ down | Outbox retry |
| DB down | 503 |
| Duplicate claim | 409 hoặc trả claim cũ |
| OTP sai quá N | `REJECTED` + case `VERIFICATION_FAILED` |
| OTP quá hạn | `CANCELLED`, chỉ audit |
| Assessment cũ đến muộn | Bỏ qua theo version, ghi log |

---

## 7. S2 — GRAPH & RISK SERVICE

### 7.1. Trách nhiệm

- Nhận tín hiệu fingerprint/IP/email/identity.
- HMAC trước khi lưu.
- Cập nhật graph.
- Tìm tài khoản liên quan.
- Tính risk theo 4 nhóm D/N/I/V.
- Lưu assessment idempotent.
- Cập nhật projection trial/registration.
- Cung cấp graph/neighbors cho S3.

### 7.2. Neo4j model

#### Nodes

| Node | Thuộc tính chính |
|---|---|
| `ObservedUser` | `userId`, `registeredAt`, `emailVerified`, `disposableEmail`, `emailPatternRisk` |
| `BrowserSignal` | `fingerprintKey`, `keyVersion`, `support`, `firstSeenAt`, `lastSeenAt` |
| `IpSignal` | `ipKey`, `subnetKey`, `support`, `firstSeenAt`, `lastSeenAt` |
| `SubnetSignal` | `subnetKey`, `support` |
| `EmailDomainSignal` | `emailDomainKey`, `support` |
| `RiskAssessment` | `assessmentId`, `assessmentKey`, `claimId`, `evaluationVersion`, `userId`, `score`, `level`, `decision`, `groupScoresJson`, `reasonsJson`, `ruleVersion`, `evaluatedAt` |
| `TrialHistoryProjection` | `projectionKey`, `userId`, `campaignId`, `claimStatus`, `lastVersion`, `updatedAt` |
| `ProcessedEvent` | `eventId`, `processedAt` |

#### Relationships

| Relationship | Thuộc tính |
|---|---|
| `OBSERVED_FP` | `clientConfidence` (advisory), `deviceStability` (server-side), `observationDays`, `firstSeenAt`, `lastSeenAt`, `count` |
| `OBSERVED_IP` | `firstSeenAt`, `lastSeenAt`, `count` |
| `OBSERVED_SUBNET` | `firstSeenAt`, `lastSeenAt`, `count` |
| `HAS_EMAIL_DOMAIN` | `firstSeenAt`, `lastSeenAt` |
| `REGISTERED_FROM` | `registeredAt` |
| `HAS_ASSESSMENT` | — |
| `HAS_TRIAL_PROJECTION` | — |

#### Constraints

```cypher
CREATE CONSTRAINT observed_user_id IF NOT EXISTS
FOR (u:ObservedUser) REQUIRE u.userId IS UNIQUE;

CREATE CONSTRAINT fp_key IF NOT EXISTS
FOR (f:BrowserSignal) REQUIRE f.fingerprintKey IS UNIQUE;

CREATE CONSTRAINT ip_key IF NOT EXISTS
FOR (i:IpSignal) REQUIRE i.ipKey IS UNIQUE;

CREATE CONSTRAINT subnet_key IF NOT EXISTS
FOR (s:SubnetSignal) REQUIRE s.subnetKey IS UNIQUE;

CREATE CONSTRAINT email_domain_key IF NOT EXISTS
FOR (e:EmailDomainSignal) REQUIRE e.emailDomainKey IS UNIQUE;

CREATE CONSTRAINT assessment_id IF NOT EXISTS
FOR (r:RiskAssessment) REQUIRE r.assessmentId IS UNIQUE;

CREATE CONSTRAINT assessment_key IF NOT EXISTS
FOR (r:RiskAssessment) REQUIRE r.assessmentKey IS UNIQUE;

CREATE CONSTRAINT projection_key IF NOT EXISTS
FOR (p:TrialHistoryProjection) REQUIRE p.projectionKey IS UNIQUE;

CREATE CONSTRAINT processed_event_id IF NOT EXISTS
FOR (e:ProcessedEvent) REQUIRE e.eventId IS UNIQUE;
```

#### Indexes

```cypher
CREATE INDEX user_registered_at IF NOT EXISTS
FOR (u:ObservedUser) ON (u.registeredAt);

CREATE INDEX fp_support IF NOT EXISTS
FOR (f:BrowserSignal) ON (f.support);

CREATE INDEX ip_support IF NOT EXISTS
FOR (i:IpSignal) ON (i.support);

CREATE INDEX subnet_support IF NOT EXISTS
FOR (s:SubnetSignal) ON (s.support);

CREATE INDEX email_domain_support IF NOT EXISTS
FOR (e:EmailDomainSignal) ON (e.support);
```

### 7.3. Signal ingestion

Input từ S1:

```json
{
  "claimId": "claim_001",
  "evaluationVersion": 1,
  "userId": "user_001",
  "campaignId": "PREMIUM_7_DAYS",
  "accountCreatedAt": "2026-11-04T09:58:00Z",
  "visitorId": "abc123",
  "clientFingerprintConfidence": 0.82,
  "trustedIp": "203.0.113.10",
  "emailDomainKey": "hmac-domain",
  "emailVerified": true,
  "disposableEmail": false,
  "emailPatternRisk": "LOW",
  "correlationId": "req-001"
}
```

Quy tắc:

- `visitorId` null → không tạo `BrowserSignal` null.
- `trustedIp` lấy từ gateway/S1, không tin client.
- HMAC fingerprint/IP/domain.
- `subnetKey = HMAC(/24 của IP)`.
- `support` = số user distinct liên kết; có thể đếm trực tiếp hoặc maintain counter.
- `clientFingerprintConfidence` chỉ lưu để debug, **không dùng để quyết định**.
- `device_stability` do S2 tự tính từ lịch sử quan sát:
  - `observationDays` = số ngày distinct đã thấy fingerprint.
  - `device_stability = min(1, observationDays / 7)`.
  - Nếu chưa từng thấy fingerprint → 0.
- `OBSERVED_FP` lưu `clientConfidence` (advisory) và `deviceStability` (server-side).

### 7.4. Assessment idempotency

`assessmentKey = claimId:evaluationVersion`.

- Nếu đã có assessment → trả lại, không tạo mới.
- Nếu hai request đồng thời → unique constraint + bắt lỗi duplicate, đọc lại.
- Retry do lỗi mạng giữ nguyên `evaluationVersion`.
- OTP thành công tăng `evaluationVersion`.

### 7.5. Mô hình risk 4 nhóm

#### Tổng quát

```text
D = Device/Graph score 0..100
N = Network score 0..100
I = Identity/Email score 0..100
V = Velocity/Behavior score 0..100

R = 0.40*D + 0.15*N + 0.20*I + 0.25*V
```

#### Quy ước đếm và chuẩn hóa

Trước khi tính D/N/I/V, chốt các quy ước sau:

- Cửa sổ thời gian: `10 phút`, `1 giờ`, `24 giờ`, `7 ngày`, `30 ngày`.
- `relatedAccounts` = số **userId distinct**, **không tính user hiện tại**.
- Chỉ đếm claim/event cuối cùng; **không đếm retry** `PENDING_RISK_CHECK`.
- Dedupe theo `claimId` và `eventId`.
- `support(signal)` = số userId distinct đã dùng signal trong 30 ngày.
- `observationDays` = số ngày distinct đã thấy fingerprint.
- `device_stability = min(1, observationDays / 7)`; không dùng confidence do client gửi.
- `decay = 0.5 ^ (age_days / 14)`.

Công thức chuẩn hóa chốt:

| Biến | Công thức |
|---|---|
| `fp_trial_link_norm` | `min(1, Σ rarity(fp) * decay(lastSeen) * device_stability)` cho related account có trial ACTIVE/EXPIRED cùng campaign trong 30 ngày |
| `fp_multi_account_norm` | `min(1, max(0, distinctFpAccounts - 1) / 4)`; gồm cả user hiện tại |
| `ip_rare_link_norm` | `min(1, Σ rarity(ip/subnet) * decay(lastSeen))` cho related account trong 30 ngày |
| `ip_burst_norm` | `min(1, max(count10m/3, count1h/5, count24h/20))`; đếm **claim cuối**, không đếm retry |
| `prior_reject` | `min(1, rejectedClaims90d / 3)`; rejected claim distinct trong 90 ngày |
| `verify_failures` | `min(1, failedVerifications30d / 3)` |
| `email_domain_cluster` | `min(1, max(0, support(domain) - 1) / 10)`; support trong 30 ngày |

Quy ước:

- `relatedAccounts` không tính user hiện tại.
- `support` tính tất cả userId distinct, gồm user hiện tại.
- Retry `PENDING_RISK_CHECK` không làm tăng velocity.
- Một claim chỉ đóng góp một lần vào count.

#### Nhóm D — Device/Graph

**Câu hỏi:** Có tài khoản khác dùng chung fingerprint không?

| Tín hiệu | Công thức / điểm |
|---|---|
| `fp_trial_link` | Tổng `rarity * decay * device_stability` của tài khoản liên quan từng nhận trial cùng campaign |
| `fp_multi_account` | `min(1, (distinctFpAccounts - 1) / 4)`; `distinctFpAccounts` gồm cả user hiện tại |
| `device_stability` | `min(1, observationDays / 7)` |

```text
D = 100 * min(1,
  0.55 * fp_trial_link_norm +
  0.30 * fp_multi_account_norm +
  0.15 * device_stability
)
```

Cap:

- Nếu `device_stability < 0.3` → `D = min(D, 30)`.
- Nếu `visitorId` null → `D = 0`.

#### Nhóm N — Network

**Câu hỏi:** IP/subnet có bất thường không?

| Tín hiệu | Công thức / điểm |
|---|---|
| `ip_rare_link` | Tổng `rarity * decay` của tài khoản liên quan qua IP/subnet |
| `ip_burst` | `max(count10m/3, count1h/5, count24h/20)` |
| `network_type_risk` | 0 nếu không có dữ liệu; 0.5 nếu nghi proxy/VPN; 1 nếu Tor/hosting |

```text
N = 100 * min(1,
  0.60 * ip_rare_link_norm +
  0.30 * ip_burst_norm +
  0.10 * network_type_risk
)
```

Quy tắc:

- IP chung có support lớn → rarity thấp → N thấp.
- **N một mình không đủ REJECT.**

#### Nhóm I — Identity/Email

**Câu hỏi:** Danh tính có dấu hiệu dùng một lần không?

| Tín hiệu | Điểm |
|---|---:|
| `disposableEmail` | 1.0 |
| `emailVerified = false` | 0.4 |
| `emailPatternRisk` | LOW=0, MEDIUM=0.5, HIGH=1.0 |
| `email_domain_cluster` | `min(1, max(0, support-1)/10)` |

```text
I = 100 * min(1,
  0.55 * disposable +
  0.20 * unverified +
  0.15 * pattern_risk +
  0.10 * domain_cluster
)
```

Quy tắc:

- Disposable một mình = 55 điểm; **chưa phải nhóm mạnh** (ngưỡng 60).
- Disposable một mình → tối đa VERIFY.
- Disposable kết hợp thêm tín hiệu identity/velocity đủ mạnh có thể dẫn đến REJECT **nếu thỏa hàm quyết định**.
- Không block Gmail/Yahoo/Outlook như disposable.

#### Nhóm V — Velocity/Behavior

**Câu hỏi:** Hành vi có giống tạo hàng loạt không?

| Tín hiệu | Điểm |
|---|---:|
| Account age < 5 phút | 1.0 |
| Account age < 1 giờ | 0.6 |
| Account age < 24 giờ | 0.3 |
| Burst signup/claim 10m/1h/24h | `max(count10m/3, count1h/5, count24h/20)` |
| Prior rejected trial | `min(1, rejectedClaims90d/3)` |
| Verification failures | `min(1, failedVerifications30d/3)` |

```text
V = 100 * min(1,
  0.40 * age_risk +
  0.30 * burst_risk +
  0.20 * prior_reject +
  0.10 * verify_failures
)
```

### 7.6. Rarity

```text
rarity(signal) = log((N + 1) / (support + 1)) / log(N + 1)
```

- `N` = tổng số account trong cửa sổ.
- `support` = số account distinct dùng signal.
- Clamp 0..1.

Ví dụ với N=1000:

| Support | Rarity |
|---:|---:|
| 2 | 0.84 |
| 50 | 0.43 |
| 100 | 0.33 |
| 800 | 0.03 |

### 7.7. Time decay

```text
decay = 0.5 ^ (age_days / 14)
```

| Age | Decay |
|---:|---:|
| 0 ngày | 1.00 |
| 14 ngày | 0.50 |
| 30 ngày | 0.23 |
| 90 ngày | 0.01 |

### 7.8. Device stability — không dùng confidence từ client

- FingerprintJS OSS là tín hiệu xác suất, có thể bị spoof; không có độ chính xác bảo đảm trong mọi môi trường.
- `clientFingerprintConfidence` do client gửi **không được dùng để quyết định**.
- S2 tự tính `device_stability` từ lịch sử quan sát:
  - Fingerprint mới thấy 1 ngày → stability thấp.
  - Thấy >= 7 ngày → stability = 1.
- `device_stability < 0.3` → cap D = 30.
- `visitorId` null → D = 0.

**Giới hạn cần ghi rõ:**

- `device_stability` chỉ đo **số ngày đã thấy fingerprint**, không chứng minh fingerprint đáng tin.
- Fingerprint mới thấy 1–2 ngày bị cap D <= 30, kể cả khi nó dùng chung cho nhiều tài khoản.
- Đây là lựa chọn **thận trọng để giảm false positive**: trường hợp mới sẽ đi VERIFY thay vì REJECT.
- Khi demo, muốn chứng minh tín hiệu fingerprint mạnh thì phải seed lịch sử quan sát nhiều ngày; nếu không, chấp nhận kết quả VERIFY.

### 7.9. Decision policy — một hàm duy nhất

```text
strongGroups = count(D >= 60, I >= 60, V >= 60)

if R >= 40 AND strongGroups >= 2:
    decision = REJECT
elif R >= 30 OR max(D, I, V) >= 60:
    decision = VERIFY
else:
    decision = ALLOW
```

Quy tắc an toàn:

- Nếu chỉ N >= 60 và D/I/V < 60 → tối đa VERIFY.
- Nếu D cao nhưng `device_stability` thấp → D bị cap 30, không REJECT một mình.
- Nếu I cao nhưng V thấp → VERIFY, không REJECT.
- Nếu D + V cùng >= 60 và R >= 40 → REJECT.
- Nếu I + V cùng >= 60 và R >= 40 → REJECT.
- Nếu D + I cùng >= 60 và R >= 40 → REJECT.
- Nếu `R >= 40` nhưng chỉ có 1 nhóm mạnh → VERIFY.
- `level` suy ra từ decision: ALLOW=LOW, VERIFY=MEDIUM, REJECT=HIGH.

### 7.10. Reason codes

| Group | Code | Nghĩa |
|---|---|---|
| D | `DEVICE_SHARED_FP_TRIAL` | Fingerprint trùng tài khoản từng nhận trial |
| D | `DEVICE_MULTI_ACCOUNT` | Fingerprint liên kết nhiều tài khoản |
| D | `DEVICE_LOW_STABILITY` | Fingerprint mới, chưa đủ ổn định |
| N | `NETWORK_RARE_LINK` | IP/subnet hiếm, có liên kết |
| N | `NETWORK_BURST` | Burst signup/claim |
| N | `NETWORK_PROXY_RISK` | Proxy/VPN/hosting |
| I | `IDENTITY_DISPOSABLE_EMAIL` | Email dùng một lần |
| I | `IDENTITY_UNVERIFIED` | Email chưa xác minh |
| I | `IDENTITY_PATTERN` | Local part bất thường |
| I | `IDENTITY_DOMAIN_CLUSTER` | Nhiều account cùng domain |
| V | `VELOCITY_NEW_ACCOUNT` | Tài khoản quá mới |
| V | `VELOCITY_BURST` | Đăng ký/claim hàng loạt |
| V | `VELOCITY_PRIOR_REJECT` | Từng bị từ chối |
| V | `VELOCITY_VERIFY_FAILURES` | Xác minh thất bại nhiều lần |

### 7.11. Assessment response

```json
{
  "assessmentId": "ra_001",
  "assessmentKey": "claim_001:1",
  "claimId": "claim_001",
  "evaluationVersion": 1,
  "userId": "user_001",
  "score": 63,
  "level": "HIGH",
  "decision": "REJECT",
  "groupScores": { "D": 85, "N": 30, "I": 20, "V": 80 },
  "reasons": [
    { "code": "DEVICE_SHARED_FP_TRIAL", "group": "D" },
    { "code": "VELOCITY_BURST", "group": "V" }
  ],
  "ruleVersion": "risk-v4.1",
  "evaluatedAt": "2026-11-04T10:00:00Z"
}
```

> `R = 0.40*85 + 0.15*30 + 0.20*20 + 0.25*80 = 62.5`, làm tròn hiển thị thành `63`.  
> `strongGroups = 2` (D=85, V=80) và `R >= 40` → `REJECT`.

### 7.12. Cypher queries

#### Tài khoản cùng fingerprint

```cypher
MATCH (u:ObservedUser {userId: $userId})-[r1:OBSERVED_FP]->(f:BrowserSignal)
      <-[r2:OBSERVED_FP]-(other:ObservedUser)
WHERE other.userId <> $userId
  AND r2.lastSeenAt >= $windowStart
RETURN DISTINCT other.userId AS relatedUserId,
       f.support AS support,
       r2.deviceStability AS deviceStability,
       r2.clientConfidence AS clientConfidence,
       r2.lastSeenAt AS lastSeenAt
LIMIT 50;
```

#### Tài khoản cùng IP/subnet

```cypher
MATCH (u:ObservedUser {userId: $userId})-[:OBSERVED_IP]->(i:IpSignal)
      <-[:OBSERVED_IP]-(other:ObservedUser)
WHERE other.userId <> $userId
  AND i.lastSeenAt >= $windowStart
RETURN DISTINCT other.userId AS relatedUserId,
       i.support AS support,
       i.lastSeenAt AS lastSeenAt
LIMIT 50;
```

#### Trial history của tài khoản liên quan

```cypher
MATCH (u:ObservedUser)-[:HAS_TRIAL_PROJECTION]->(p:TrialHistoryProjection)
WHERE u.userId IN $userIds
RETURN u.userId AS userId,
       p.campaignId AS campaignId,
       p.claimStatus AS status,
       p.updatedAt AS updatedAt;
```

#### Support của fingerprint

```cypher
MATCH (f:BrowserSignal {fingerprintKey: $fingerprintKey})
OPTIONAL MATCH (f)<-[:OBSERVED_FP]-(u:ObservedUser)
RETURN count(DISTINCT u) AS support;
```

> Với 300–500 account, có thể count trực tiếp. Nếu cần nhanh, maintain `support` counter.

#### Neighbors cho S3

```cypher
MATCH (u:ObservedUser {userId: $userId})-[:OBSERVED_FP|OBSERVED_IP|OBSERVED_SUBNET]-(s)
      <-[:OBSERVED_FP|OBSERVED_IP|OBSERVED_SUBNET]-(other:ObservedUser)
WHERE other.userId <> $userId
RETURN DISTINCT other.userId AS userId,
       labels(s) AS signalTypes
LIMIT 50;
```

### 7.13. Projection consumers

S2 consume:

- `account.registered.v1` → `ObservedUser.registeredAt`, `REGISTERED_FROM`.
- `trial.activated.v1` → `TrialHistoryProjection` ACTIVE.
- `trial.rejected.v1` → `TrialHistoryProjection` REJECTED.
- `trial.expired.v1` → `TrialHistoryProjection` EXPIRED.

Inbox: `ProcessedEvent` trong cùng Neo4j transaction.

### 7.14. API

| Method | Endpoint | Auth | Mục đích |
|---|---|---|---|
| POST | `/internal/risk/assessments` | internal | S1 gọi chấm điểm |
| GET | `/internal/risk/assessments/{id}` | internal | Đọc assessment |
| GET | `/internal/graph/users/{userId}/subgraph` | internal | S3 xem graph |
| GET | `/internal/graph/users/{userId}/neighbors` | internal | S3 enrich |
| GET | `/api/risk/users/{userId}` | ADMIN | Risk của user |
| GET | `/api/risk/clusters` | ADMIN | Danh sách cụm |
| GET | `/api/risk/assessments/{id}` | ADMIN | Assessment detail |
| GET | `/api/risk/stats` | ADMIN | Thống kê risk |
| GET | `/health` | public | Health |
| GET | `/ready` | public | Readiness |

### 7.15. Failure handling

| Tình huống | Hành vi |
|---|---|
| Neo4j down | 503 |
| Query chậm | 504 |
| Assessment lặp | Trả existing |
| Hai request đồng thời | Unique constraint + retry |
| Event lặp | `ProcessedEvent` bỏ qua |
| Graph quá lớn | Limit + `truncated` |
| S1 gửi version cũ | 422 `STALE_RISK_CONTEXT` |

### 7.16. Performance

- Risk query: direct neighbors + 1 hop, limit 50.
- Graph view: max depth 3, max 100 nodes, 200 edges.
- Target P95 < 1s trên 500 account local.
- Không load toàn bộ graph.

---

## 8. S3 — FRAUD CASE & INVESTIGATION SERVICE

### 8.1. Trách nhiệm

- Nhận event quyết định cuối.
- Tạo case idempotent.
- Enrich bằng graph S2.
- Ghép cụm, tính severity P1/P2/P3.
- Audit/event append-only; case row cập nhật trạng thái/severity/enrichment.
- Retention auto-close.
- Dashboard/graph view.

### 8.2. Vì sao không thừa

Nếu S3 chỉ read-only, nó là materialized view/audit. Nhưng bản này S3 sở hữu:

- Case lifecycle.
- Cluster linking.
- Severity.
- Audit/retention.
- Dashboard.
- RabbitMQ consumer + DLQ.

Đó là nghiệp vụ riêng, không phải CRUD.

### 8.3. Data model

```sql
CREATE TABLE fraud_cases (
  case_id UUID PRIMARY KEY,
  claim_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  campaign_id TEXT NOT NULL,
  assessment_id TEXT,
  decision TEXT NOT NULL,
  risk_score INT,
  risk_level TEXT,
  group_scores_json JSONB NOT NULL DEFAULT '{}',
  strong_group_count INT NOT NULL DEFAULT 0,
  reason_codes JSONB NOT NULL DEFAULT '[]',
  cluster_key TEXT,
  severity TEXT,
  severity_reasons JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'OPEN',
  enrichment_status TEXT NOT NULL DEFAULT 'PENDING',
  enrichment_attempts INT NOT NULL DEFAULT 0,
  next_enrich_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_enrich_error TEXT,
  graph_status TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  close_reason TEXT, -- TRIAL_EXPIRED | SUPERSEDED_BY_NEWER_EVENT | RETENTION
  retention_until TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cases_status_severity
  ON fraud_cases(status, severity, opened_at DESC);

CREATE INDEX idx_cases_user_time
  ON fraud_cases(user_id, opened_at DESC);

CREATE INDEX idx_cases_cluster
  ON fraud_cases(cluster_key);

CREATE TABLE case_links (
  case_id UUID NOT NULL REFERENCES fraud_cases(case_id),
  related_case_id UUID NOT NULL REFERENCES fraud_cases(case_id),
  link_type TEXT NOT NULL,
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, related_case_id)
);

CREATE TABLE case_events (
  event_id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES fraud_cases(case_id),
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_events_case_time
  ON case_events(case_id, created_at);

CREATE TABLE s3_inbox (
  event_id UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lưu trạng thái cuối theo claim, kể cả khi chưa có case.
-- Dùng để xử lý event đến sai thứ tự.
CREATE TABLE claim_event_state (
  claim_id UUID PRIMARY KEY,
  last_version INT NOT NULL,
  last_status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE security_audit_events (
  event_id UUID PRIMARY KEY,
  claim_id UUID,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.4. Event consumption

| Event | S3 làm gì |
|---|---|
| `trial.rejected.v1` | Tạo case `AUTO_REJECT` hoặc `VERIFICATION_FAILED` |
| `trial.activated.v1` với `riskLevel != LOW` | Tạo case `VERIFIED_MONITORED` |
| `trial.activated.v1` với LOW | Chỉ audit |
| `trial.expired.v1` | Đóng case nếu có |
| `trial.claim_audit.v1` | Ghi audit |

Consumer — tách **hai việc độc lập**:

1. Begin transaction.
2. Check `s3_inbox` theo `eventId`; nếu đã có → commit/ack, bỏ qua.
3. Đọc `claim_event_state` hiện tại.
4. **Cập nhật trạng thái**:
   - Nếu `version > last_version` → cập nhật `last_version`, `last_status`.
   - Nếu `version <= last_version` → **không ghi đè trạng thái**.
5. **Bổ sung hồ sơ nếu còn thiếu**:
   - Event `trial.rejected` luôn là case-worthy.
   - Event `trial.activated` là case-worthy nếu `riskLevel != LOW`.
   - Nếu chưa có case và event là case-worthy → tạo case từ snapshot của event.
   - Nếu event là bản cũ (`version <= last_version`) hoặc trạng thái cuối là `EXPIRED`:
     - Tạo case ở trạng thái `CLOSED`.
     - `close_reason = TRIAL_EXPIRED` nếu trạng thái cuối là EXPIRED.
     - `close_reason = SUPERSEDED_BY_NEWER_EVENT` nếu trạng thái cuối khác EXPIRED.
   - Nếu event là bản mới và trạng thái cuối là ACTIVE/REJECTED → tạo case theo luồng bình thường.
6. Nếu case đã tồn tại:
   - Không đổi decision/severity từ event cũ.
   - Event mới hơn có thể đóng case nếu là `trial.expired`.
   - Có thể append `STALE_EVENT_IGNORED` để audit.
7. Insert inbox.
8. Commit.
9. Ack.

Quy tắc event sai thứ tự:

- `trial.expired` version 3 đến trước `trial.activated` version 2:
  - Lưu state `EXPIRED`, version 3.
  - Chưa có case.
  - Khi activation version 2 đến: không ghi đè state, **nhưng vẫn tạo case CLOSED** với lý do `TRIAL_EXPIRED`.
  - Kết quả: có đúng **một case CLOSED**, không có case OPEN sai.
- `trial.activated` version 2 đến trước, `trial.expired` version 3 đến sau:
  - Tạo case bình thường.
  - Event expired đóng case.
- `trial.rejected` và `trial.activated` cùng claim:
  - State chỉ lấy version cao hơn.
  - Case chỉ tạo một lần theo `claim_id`.
  - Event cũ vẫn có thể tạo hồ sơ nếu chưa có case, nhưng case phải `CLOSED` với lý do `SUPERSEDED_BY_NEWER_EVENT`.

### 8.5. Enrichment worker

1. Tìm case có `enrichment_status IN ('PENDING','PARTIAL')` và `next_enrich_at <= now()`.
   - Khi tạo case: `next_enrich_at = now()`.
   - Nếu `next_enrich_at` NULL (dữ liệu cũ), coi như `now()` để không bị kẹt.
2. Gọi S2 `/internal/graph/users/{userId}/neighbors`.
3. Tìm case liên quan trong 30 ngày.
   - `campaign_id` chỉ là **phạm vi so sánh**, không phải tiêu chí ghép cụm.
   - Chỉ link khi:
     - cùng `user_id`, hoặc
     - cùng cluster từ S2, hoặc
     - cùng fingerprint/IP/subnet **hiếm** với độ mạnh đủ ngưỡng.
4. Tạo `case_links` với `link_type`:
   - `SAME_USER`
   - `SAME_CLUSTER`
   - `SAME_FINGERPRINT_RARE`
   - `SAME_IP_RARE`
   - `SAME_SUBNET_BURST`
5. Chọn `cluster_key` = `case_id` nhỏ nhất trong cụm.
6. Nếu hai cụm được nối:
   - Chọn key nhỏ hơn.
   - Update toàn bộ case của cụm còn lại sang key mới trong cùng transaction.
   - Append `CASE_CLUSTER_MERGED` cho các case bị đổi key.
7. Tính severity.
8. Update case + append `CASE_ENRICHED`/`CASE_LINKED`.
9. Nếu S2 lỗi: `graph_status=UNAVAILABLE`, giữ PENDING/PARTIAL, backoff.
10. Sau max attempts: `FAILED`, case vẫn còn.

### 8.6. Severity

```text
Base:
  HIGH   -> P1
  MEDIUM -> P2
  LOW    -> P3

+1 mức nếu >=2 case liên quan trong 30 ngày
+1 mức nếu có >=2 nhóm D/I/V >= 60
Clamp P1..P3
```

Không dùng F1/F2/F5 cũ. Severity dùng:
- `risk_level`
- số case liên quan
- số nhóm mạnh D/I/V
- `reason_codes` chỉ để hiển thị/audit.

Ví dụ:

| Case | Risk | Related | Strong groups D/I/V | Severity |
|---|---|---|---:|---|
| A | HIGH | 0 | 1 | P1 |
| B | MEDIUM | 2 | 2 | P1 |
| C | MEDIUM | 0 | 1 | P2 |
| D | LOW | 0 | 0 | P3 |
| E | HIGH | 3 | 2 | P1 |

Severity **không** dùng để cấp/từ chối trial.

### 8.7. Retention

- P1: 180 ngày.
- P2: 90 ngày.
- P3: 30 ngày.
- Job daily đóng case `OPEN` quá `retention_until`.
- Append `CASE_CLOSED`.

### 8.8. API

| Method | Endpoint | Auth | Mục đích |
|---|---|---|---|
| GET | `/api/cases` | ADMIN | Danh sách/filter |
| GET | `/api/cases/{id}` | ADMIN | Chi tiết |
| GET | `/api/cases/{id}/events` | ADMIN | Lịch sử |
| GET | `/api/cases/{id}/related` | ADMIN | Case liên quan |
| GET | `/api/cases/{id}/graph` | ADMIN | Graph (422 depth>3) |
| GET | `/api/dashboard/overview` | ADMIN | Dashboard |
| GET | `/health` | public | Health |
| GET | `/ready` | public | Readiness |

Business 4xx:

- `422 GRAPH_DEPTH_LIMIT_EXCEEDED`.
- `422 INVALID_FILTER`.
- `404 CASE_NOT_FOUND`.
- `403 NOT_ADMIN`.

### 8.9. Failure handling

| Tình huống | Hành vi |
|---|---|
| S3 down | RabbitMQ giữ event |
| S2 down khi enrich | Case vẫn tạo, PENDING |
| S2 down khi graph | 503/504 |
| Duplicate event | Inbox bỏ qua |
| Bad schema | DLQ |
| DB down | Không ack, retry |

### 8.10. Dashboard metrics

- Tổng case, open/closed.
- Theo severity.
- Theo decision.
- Theo campaign.
- Top cluster.
- Enrichment backlog.
- Auto decision rate.
- Time-to-enrich P95.

---

## 9. EVENT-DRIVEN ARCHITECTURE

### 9.1. Envelope

```json
{
  "eventId": "uuid",
  "eventType": "trial.rejected.v1",
  "occurredAt": "2026-11-04T10:00:00Z",
  "correlationId": "req-001",
  "producer": "account-trial-service",
  "schemaVersion": 1,
  "aggregateId": "claim_001",
  "aggregateVersion": 3,
  "payload": {}
}
```

### 9.2. Event catalog

| Event | Producer | Consumer | Payload chính |
|---|---|---|---|
| `account.registered.v1` | S1 | S2 | userId, accountCreatedAt, registrationIp, emailDomainKey |
| `trial.activated.v1` | S1 | S2, S3 | claimId, userId, campaignId, riskScore, riskLevel, decision, groupScores, strongGroupCount, reasons, activatedAt, expiresAt |
| `trial.rejected.v1` | S1 | S2, S3 | claimId, userId, campaignId, riskScore, riskLevel, decision, groupScores, strongGroupCount, reasons, rejectedAt |
| `trial.expired.v1` | S1 | S2, S3 | claimId, userId, campaignId, expiredAt |
| `trial.claim_audit.v1` | S1 | S3 | claimId, userId, action, occurredAt |

### 9.3. RabbitMQ topology

- Exchange: `fraud.events` (topic, durable).
- Queues:
  - `risk.account.events` ← `account.registered.v1`
  - `risk.trial.events` ← `trial.activated.v1`, `trial.rejected.v1`, `trial.expired.v1`
  - `case.trial.events` ← `trial.activated.v1`, `trial.rejected.v1`, `trial.expired.v1`
  - `case.audit.events` ← `trial.claim_audit.v1`
- DLQ: `fraud.dlq` hoặc DLQ riêng từng queue.
- Retry: TTL queue + DLX, max 3 lần.
- Prefetch 5, manual ack, persistent message.

### 9.4. Outbox/Inbox

- S1 outbox: insert cùng transaction claim/account.
- S1 publisher: `amqplib` ConfirmChannel.
- S2 inbox: `ProcessedEvent` trong Neo4j transaction.
- S3 inbox: `s3_inbox` trong PostgreSQL transaction.
- Ack sau commit.
- Duplicate event → bỏ qua.
- At-least-once + idempotent effect.

### 9.5. Ordering

- Event có `aggregateVersion`.
- S2 projection chỉ update nếu `aggregateVersion > lastVersion`.
- `trial.activated`/`trial.expired` đến lệch thứ tự không ghi đè sai.
- S3 lưu `claim_event_state` cho **mọi** trial event, kể cả khi chưa có case:
  - `claim_id`, `last_version`, `last_status`.
  - Event có version <= last_version **không ghi đè trạng thái**.
  - Nhưng event case-worthy cũ vẫn được dùng để **bổ sung hồ sơ còn thiếu**.
  - Nếu `expired` đến trước `activated`, S3 tạo case `CLOSED` lý do `TRIAL_EXPIRED` khi activation cũ đến sau.
- Inbox chỉ chống trùng event; **không** thay thế version/state ordering hoặc logic bổ sung hồ sơ.

### 9.6. Failure handling

| Tình huống | Hành vi |
|---|---|
| S2 down | Queue giữ event |
| S3 down | Queue giữ event |
| RabbitMQ down | Outbox retry |
| Event lặp | Inbox bỏ qua |
| Schema lỗi | DLQ |
| Consumer crash | Message chưa ack, giao lại |

---

## 10. API CONTRACT

### 10.1. Quy ước

- JSON, ISO-8601 UTC.
- `X-Correlation-Id`.
- Error format:

```json
{
  "statusCode": 409,
  "errorCode": "TRIAL_ALREADY_CLAIMED",
  "message": "Tài khoản đã đăng ký chương trình dùng thử này.",
  "correlationId": "..."
}
```

- 400: sai định dạng.
- 401: thiếu/sai JWT.
- 403: không đủ quyền.
- 404: không tìm thấy.
- 409/422: nghiệp vụ.
- 503: dependency unavailable.
- 504: dependency timeout.

### 10.2. Gateway routing

| Route | Service |
|---|---|
| `/api/auth/*`, `/api/users/*`, `/api/trials/*`, `/api/admin/*` | S1 |
| `/api/risk/*` | S2 |
| `/api/cases/*`, `/api/dashboard/*` | S3 |
| `/api/health/account` | S1 `/health` |
| `/api/health/risk` | S2 `/health` |
| `/api/health/case` | S3 `/health` |
| `/internal/*` | Deny từ gateway |

### 10.3. OpenAPI

```text
docs/openapi/
  account-trial.openapi.yaml
  graph-risk.openapi.yaml
  fraud-case.openapi.yaml
```

- `servers: http://localhost:8080` (gateway).
- Public endpoints only.
- Internal endpoints có thể tách file riêng hoặc đánh dấu `x-internal`.
- Mỗi file ≥4 path.
- Commit cả 3 file.

### 10.4. Postman

- `tests/postman/fraud-platform.postman_collection.json`.
- Environment: `baseUrl`, `userToken`, `adminToken`, `claimId`, `caseId`.
- ≥10 request, gồm success + lỗi nghiệp vụ.
- Có setup request tạo case mới để chạy lại được.

---

## 11. DATA DESIGN VÀ ISOLATION

### 11.1. PostgreSQL S1

- `account_trial_db`.
- User `account_svc`.
- Chỉ S1 migration.

### 11.2. PostgreSQL S3

- `fraud_case_db`.
- User `case_svc`.
- Chỉ S3 migration.

### 11.3. Neo4j S2

- Instance riêng.
- Chỉ S2 credential.
- Không expose port ra ngoài.

### 11.4. Cô lập quyền

```sql
REVOKE ALL ON DATABASE fraud_case_db FROM PUBLIC;
GRANT CONNECT ON DATABASE fraud_case_db TO case_svc;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO case_svc;
```

Làm tương tự cho `account_trial_db`.

### 11.5. Kiểm tra

- Dùng `psql` với `account_svc` truy cập `fraud_case_db` phải bị từ chối.
- S2 không có connection string PostgreSQL.
- S3 không có connection string Neo4j.

---

## 12. RELIABILITY & FAILURE HANDLING

### 12.1. Timeout/retry

| Caller → Callee | Operation | Timeout | Retry |
|---|---|---:|---|
| S1 → S2 | POST assessments | 2s | 2 attempts, idempotent |
| S3 → S2 | GET subgraph/neighbors | 3s | 2 attempts |
| S1 → RabbitMQ | Publish | 2s | Outbox retry |
| S2/S3 consumer | Process | — | Manual ack, DLQ |

### 12.2. Circuit breaker S1 → S2

- CLOSED: gọi bình thường.
- 3 lỗi hạ tầng liên tiếp trong 30s → OPEN 15s.
- OPEN: không gọi, claim PENDING.
- HALF_OPEN: thử một request; thành công → CLOSED, lỗi → OPEN.
- Metric `circuit_state`.

### 12.3. Failure matrix

| Sự cố | Phản ứng | Dữ liệu không được vi phạm |
|---|---|---|
| S2 down | S1 PENDING, retry | Không cấp trial |
| S2 slow | Timeout, circuit breaker | Không treo request |
| S3 down | Queue giữ event | Không mất case |
| RabbitMQ down | Outbox retry | Không mất event |
| Event lặp | Inbox bỏ qua | Không tạo trùng |
| Schema lỗi | DLQ | Không ack bừa |
| S2 enrich down | S3 PENDING | Case vẫn còn |
| Claim expired khi đang xử lý | S1 409 `CLAIM_NOT_REVIEWABLE` | Không cấp trial |

### 12.4. Metrics

- `risk_request_total`
- `risk_timeout_total`
- `risk_error_total`
- `decision_total{decision}`
- `pending_claim_total`
- `outbox_new_total`
- `dlq_messages`
- `duplicate_event_skipped`
- `case_enrichment_pending`
- `circuit_state`
- `case_processing_lag_ms`

---

## 13. SECURITY & PRIVACY

### 13.1. Auth

- JWT cho USER/ADMIN.
- Internal service token cho S1→S2, S3→S2.
- Role guard.
- JWT không đặt ở Gateway trong MVP.

### 13.2. Password

- Argon2id.
- Không log password.
- Rate limit login/register.

### 13.3. HMAC

- Fingerprint key.
- IP key.
- Subnet key.
- Email domain key.
- Secret trong env, không commit.

### 13.4. Privacy

- Không lưu raw fingerprint/IP.
- Không trả raw fingerprint/IP qua API public.
- Email chỉ lưu normalized + domain key; không trả raw.
- Retention 30/90/180 ngày.
- Thông báo thu thập fingerprint.
- Chỉ dùng cho chống lạm dụng.

### 13.5. Input validation

- DTO validation.
- Cypher parameters.
- SQL parameterized/ORM.
- Giới hạn depth/node/edge.
- Rate limit.

### 13.6. Audit

- Mọi quyết định auto ghi case/event.
- Không sửa/xóa audit.
- Admin chỉ đọc.

---

## 14. FRONTEND

### 14.1. User Web

- Register.
- Login.
- Campaign.
- Claim trial.
- Trạng thái: ACTIVE, VERIFY_REQUIRED, REJECTED, EXPIRED.
- OTP.
- Thông báo soft reject: “Trial chưa thể cấp; tài khoản vẫn hoạt động.”
- Không hiển thị toàn bộ rule nội bộ.

### 14.2. Admin Dashboard

- Overview: case, severity, decision, enrichment backlog.
- Case list/filter.
- Case detail: risk, reasons, group scores, related cases, events.
- Graph view.
- Audit.
- Không có nút approve/reject trial.

### 14.3. Graph UI

- Cytoscape.
- Node user/fingerprint/IP.
- Edge style theo loại.
- Không hiển thị raw IP/fingerprint.
- Giới hạn node/edge.
- Nút “Why this score?”.

---

## 15. TESTING

### 15.1. Unit/integration/e2e

| ID | Kịch bản | Kỳ vọng |
|---|---|---|
| TC-01 | Register hợp lệ | 201 |
| TC-02 | Email trùng | 409 |
| TC-03 | Login sai | 401 |
| TC-04 | Claim LOW | ACTIVE |
| TC-05 | Claim lặp key khác | 409 |
| TC-06 | Retry cùng key | Không tạo claim mới |
| TC-07 | Fingerprint trùng + velocity | REJECT |
| TC-08 | IP chung trường học | Không REJECT |
| TC-09 | Fingerprint null | Không crash, dùng tín hiệu khác |
| TC-10 | S2 down | 202 PENDING, không ACTIVE |
| TC-11 | S3 down | Queue giữ event, tạo 1 case sau |
| TC-12 | Event lặp | Inbox bỏ qua |
| TC-13 | OTP sai | 422 |
| TC-14 | OTP đúng, score vẫn MEDIUM | ACTIVE monitored, không loop |
| TC-15 | User gọi admin API | 403 |
| TC-16 | Graph depth > 3 | 422 |
| TC-17 | S3 graph khi S2 down | 503/504 |
| TC-18 | Health 3 service | 200 |
| TC-19 | Audit duplicate | 1 record |
| TC-20 | Case retention | CLOSED |
| TC-21 | OTP sai hết lượt | `REJECTED`, case `VERIFICATION_FAILED` |
| TC-22 | S2 timeout ngay sau OTP | Vẫn PENDING, không gửi OTP lại |
| TC-23 | Hai verify đồng thời | Chỉ một lần tăng `evaluationVersion` |
| TC-24 | `trial.expired` đến trước `trial.activated` | Có đúng một case `CLOSED` lý do `TRIAL_EXPIRED`; không có case OPEN sai |
| TC-25 | Assessment cũ đến muộn | Bị bỏ qua, không ghi đè trạng thái mới |

### 15.2. Postman

15 request:

1. Register.
2. Register trùng → 409.
3. Login.
4. Login sai → 401.
5. GET me.
6. GET campaigns.
7. Claim LOW.
8. Claim trùng key khác → 409.
9. GET claim.
10. Claim MEDIUM.
11. Verify OTP.
12. Claim HIGH.
13. GET cases admin.
14. GET case detail/graph.
15. User gọi admin → 403.

### 15.3. Fault tests

#### FAULT-01 — S2 down/slow

- Baseline: claim bình thường.
- Stop `graph-risk` hoặc làm chậm >2s.
- Claim mới → 202 PENDING, không ACTIVE.
- Start S2 → worker resolve.
- Đo: status, latency, pending count, timeout/retry, circuit state.

#### FAULT-02 — S3 down

- Stop `fraud-case`.
- Tạo high-risk claim → event queue.
- Start S3 → 1 case.
- Gửi duplicate → inbox bỏ qua.
- Gửi schema lỗi → DLQ.
- Đo: queue ready, case count, duplicate skipped, time-to-recover, DLQ.

#### FAULT-03 — S2 slow (optional)

- Proxy delay >2s.
- Đo timeout/retry/circuit.

### 15.4. Dataset

- 400 account:
  - 240 hợp lệ.
  - 80 shared IP/family.
  - 80 abuse, trong đó 40 evasive.
- Tổng = 400; 40 evasive là **tập con** của 80 abuse, không cộng thêm lần nữa.
- Seed cố định.
- Nhãn giả lập.
- 2 seed: dev/eval.

### 15.5. Metrics

- Precision.
- Recall.
- FPR.
- P50/P95 latency.
- Confusion matrix.
- So sánh: IP-only, fingerprint-only, F1–F6 cũ, D/N/I/V mới.

---

## 16. ĐÁNH GIÁ THUẬT TOÁN

### 16.1. Mục tiêu

Không tuyên bố “chính xác production”. Mục tiêu:

- Auto-REJECT precision cao.
- Auto-VERIFY recall cao.
- FPR thấp trên shared IP/family.

### 16.2. Cách đo

- Tune threshold trên dev seed.
- Báo cáo trên eval seed.
- Ghi rõ synthetic.
- Không điền số giả.

### 16.3. Bảng kết quả mẫu (điền sau khi chạy)

| Chiến lược | Precision | Recall | FPR | P95 |
|---|---:|---:|---:|---:|
| IP-only | Chưa đo | Chưa đo | Chưa đo | Chưa đo |
| Fingerprint-only | Chưa đo | Chưa đo | Chưa đo | Chưa đo |
| F1–F6 cũ | Chưa đo | Chưa đo | Chưa đo | Chưa đo |
| D/N/I/V mới | Chưa đo | Chưa đo | Chưa đo | Chưa đo |

---

## 17. DEPLOYMENT & OPERATIONS

### 17.1. Containers

| Container | Vai trò | Port |
|---|---|---|
| `gateway` | NGINX | `8080:80` |
| `account-trial` | S1 | internal 3001 |
| `graph-risk` | S2 | internal 3002 |
| `fraud-case` | S3 | internal 3003 |
| `web` | React static | internal |
| `postgres` | 2 DB | internal 5432 |
| `neo4j` | Graph | internal 7687/7474 |
| `rabbitmq` | Broker | internal 5672/15672 |

### 17.2. Env

```dotenv
NODE_ENV=development
ACCOUNT_PORT=3001
RISK_PORT=3002
CASE_PORT=3003
ACCOUNT_DATABASE_URL=postgresql://account_svc:...@postgres:5432/account_trial_db
CASE_DATABASE_URL=postgresql://case_svc:...@postgres:5432/fraud_case_db
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
RABBITMQ_URL=amqp://...@rabbitmq:5672
RISK_SERVICE_URL=http://graph-risk:3002
GRAPH_SERVICE_URL=http://graph-risk:3002
JWT_SECRET=...
FP_HMAC_SECRET=...
INTERNAL_SERVICE_TOKEN=...
RISK_HTTP_TIMEOUT_MS=2000
GRAPH_HTTP_TIMEOUT_MS=3000
SERVICE_MAX_ATTEMPTS=2
OTP_FIXED_CODE=123456
DEMO_AUTO_VERIFY=false
```

### 17.3. Compose skeleton

```yaml
services:
  gateway:
    build: ./infra/nginx
    ports: ["8080:80"]
    depends_on: [account-trial, graph-risk, fraud-case, web]

  account-trial:
    build: ./apps/account-trial-service
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  graph-risk:
    build: ./apps/graph-risk-service
    env_file: .env
    depends_on:
      neo4j: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  fraud-case:
    build: ./apps/fraud-case-service
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  web:
    build: ./apps/web

  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: ...

  neo4j:
    image: neo4j:5-community
    volumes: [neo4jdata:/data]
    healthcheck: ...

  rabbitmq:
    image: rabbitmq:3-management
    volumes: [rabbitdata:/var/lib/rabbitmq]
    healthcheck: ...

volumes:
  pgdata:
  neo4jdata:
  rabbitdata:
```

### 17.4. NGINX

- `/api/auth/*`, `/api/users/*`, `/api/trials/*`, `/api/admin/*` → S1.
- `/api/risk/*` → S2.
- `/api/cases/*`, `/api/dashboard/*` → S3.
- `/` → web.
- Deny `/internal/*`.
- `X-Correlation-Id`.
- Timeout/CORS/rate limit.

### 17.5. Seed

- `scripts/seed-demo-data.ts`.
- Tạo campaign, 400 account, fingerprint/IP patterns.
- Idempotent.
- Chỉ chạy khi `SEED_DEMO=true`.

### 17.6. Demo script

- Reset DB.
- Register users.
- Claim LOW/MEDIUM/HIGH.
- Verify OTP.
- Check cases.
- Fault tests.
- Print metrics.

---

## 18. KẾ HOẠCH 8 TUẦN

| Tuần | Việc chính | Gate |
|---|---|---|
| 1 | Chốt spec v4.1, contract, event schema, decision function, test data | Tài liệu + schema |
| 2 | Walking skeleton: gateway + 3 service + 3 store + health/ready; DB isolation; RMQ spike; OpenAPI skeleton | 3 health 200, isolation pass |
| 3 | S1 register/login/claim với risk giả; OpenAPI S1; unit test S1 | Claim LOW → ACTIVE |
| 4 | S2 tối giản (fingerprint/IP count); S1 → S2 → S1; OpenAPI S2; test integration | Claim thấp/cao khác nhau |
| 5 | Auto policy + OTP; RabbitMQ + S3 case; OpenAPI S3; test idempotency | HIGH → case; duplicate không tạo trùng |
| 6 | FAULT-01 + FAULT-02 có số liệu; Postman ≥10; CI; UI tối thiểu | 2 fault test + collection + CI |
| 7 | S2 nâng cao D/N/I/V + rarity/decay; cluster/severity; dashboard; OpenAPI final | Thuật toán + dashboard |
| 8 | Báo cáo, slide, rehearsal, buffer | PDF ≥30 trang, slide ≤10, demo ổn |

**Nguyên tắc:** OpenAPI và test làm cùng service, không dồn hết sang tuần 8.

### 18.1. Phân công 2 người

| Hạng mục | A | B |
|---|---|---|
| S1 | Chính | Hỗ trợ |
| S2 | Hỗ trợ | Chính |
| S3 | Chính | Hỗ trợ |
| Frontend | User + Admin case list | Graph UI |
| Infra | Compose, S1 Swagger | Neo4j, RabbitMQ, S2/S3 Swagger |
| Reliability | S1 outbox/retry | S2/S3 inbox/DLQ |
| Testing | Postman, FAULT-01 | FAULT-02, risk dataset |
| Báo cáo | Nghiệp vụ/kiến trúc | Thuật toán/đánh giá |

Cả hai phải hiểu toàn bộ luồng.

### 18.2. Fallback

- Nếu tuần 4 chưa end-to-end: cắt dashboard nâng cao, giữ core.
- Nếu tuần 5 chưa có fault test: cắt circuit breaker/audit, giữ 2 fault cơ bản.
- Nếu quá tải: gộp S3 vào S1 (2 service), vẫn đạt đề.
- Không cắt: auto policy, S2 risk, PENDING, 2 fault test, OpenAPI, Postman.

---

## 19. RUBRIC & DEFENSE

### 19.1. Report mapping

| Phần báo cáo | Nội dung |
|---|---|
| Giới thiệu | Bài toán trial abuse, tác nhân, mục tiêu |
| Phân tích nghiệp vụ | UC, BR, state machine, auto policy |
| Kiến trúc | 3 service, data ownership, sơ đồ 1 trang |
| Dữ liệu | SQL/Neo4j, event projection, isolation |
| API | 3 OpenAPI, 4xx/503/504 |
| Reliability | PENDING, outbox/inbox, DLQ, circuit breaker, fault metrics |
| Triển khai/kiểm thử | Compose, Postman, 2 fault |
| Đánh giá | Precision/Recall/FPR, false positive, limitations |
| Phụ lục | AI declaration, references, division |

### 19.2. Demo 5–10 phút

1. `docker compose up`.
2. Health 3 service.
3. Register/claim LOW → ACTIVE.
4. Claim MEDIUM → OTP → ACTIVE monitored.
5. Claim HIGH → REJECTED → case.
6. Admin dashboard/case/graph.
7. FAULT-01 S2 down → 202 PENDING → recover.
8. FAULT-02 S3 down → queue → recover.
9. Postman/OpenAPI.
10. Metrics.

### 19.3. Q&A

- Vì sao 3 service?
- Vì sao S2 dùng Neo4j?
- Vì sao auto 100%? False positive xử lý thế nào?
- Vì sao soft reject?
- Vì sao không dùng ML?
- Vì sao IP chỉ là tín hiệu yếu?
- Rarity/time decay hoạt động thế nào?
- S2 down thì sao?
- S3 down thì sao?
- Làm sao chống event trùng?
- Làm sao đảm bảo data isolation?
- Làm sao đo precision/recall?
- AI được dùng ở đâu?

**Câu trả lời mẫu cho “auto 100%”:**  
“Auto 100% là tự động hóa toàn bộ luồng quyết định — không có admin duyệt. Nó không có nghĩa là phát hiện đúng 100%. Hệ thống dùng nhiều nhóm bằng chứng, soft reject và audit để giảm false positive.”

---

## 20. RỦI RO & GIỚI HẠN

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Fingerprint OSS là tín hiệu xác suất, có thể spoof | Cao | Dùng `device_stability` server-side, nhiều nhóm, không auto-reject một mình |
| IP chung | Cao | Rarity, N yếu, không reject chỉ vì IP |
| Disposable email | Trung bình | Identity group, OTP/phone |
| False positive | Cao | Soft reject, verify, audit, appeal ngoài scope |
| S2 down | Cao | PENDING, retry, circuit breaker |
| S3 down | Trung bình | RabbitMQ durable + DLQ |
| Event trùng/lệch | Cao | Inbox, aggregateVersion |
| Dataset synthetic | Trung bình | Ghi rõ, 2 seed, baseline |
| Nhóm 2 người/8 tuần | Cao | Cắt scope, gate, fallback |

### 20.1. Hạn chế

- Không xác định danh tính thực.
- Không chống được kẻ gian có ngân sách lớn.
- Không có dữ liệu production.
- Không có ML.
- Không có WCC/Louvain.
- Không có payment/phone thật.
- Không có manual review.

### 20.2. Hướng mở rộng

- Phone verification.
- Email domain age/MX.
- Proxy/VPN intelligence.
- 1-hop/2-hop cluster.
- Logistic regression/GNN nếu có 10k+ labels.
- Manual review/appeal.
- Prometheus/Grafana.
- JWT Gateway.

---

## 21. PHỤ LỤC

### A. Reason codes

Xem mục 7.10.

### B. Error codes

| Code | HTTP | Nghĩa |
|---|---:|---|
| `EMAIL_ALREADY_EXISTS` | 409 | Email trùng |
| `INVALID_CREDENTIALS` | 401 | Sai mật khẩu |
| `TRIAL_ALREADY_CLAIMED` | 409 | Đã claim campaign |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key dùng payload khác |
| `CAMPAIGN_INACTIVE` | 422 | Campaign tắt |
| `CLAIM_NOT_OWNED` | 403 | Claim của user khác |
| `CLAIM_NOT_AWAITING_VERIFICATION` | 409 | Claim không ở VERIFY |
| `INVALID_VERIFICATION_CODE` | 422 | OTP sai |
| `CLAIM_NOT_REVIEWABLE` | 409 | Claim không thể áp dụng |
| `RISK_SERVICE_UNAVAILABLE` | 503 | S2 down |
| `RISK_SERVICE_TIMEOUT` | 504 | S2 chậm |
| `STALE_RISK_CONTEXT` | 422 | Version cũ |
| `ASSESSMENT_CONFLICT` | 409 | Assessment conflict |
| `GRAPH_DEPTH_LIMIT_EXCEEDED` | 422 | Depth > 3 |
| `CASE_NOT_FOUND` | 404 | Case không tồn tại |
| `NOT_ADMIN` | 403 | Không phải admin |

### C. Event payload examples

#### `trial.activated.v1`

```json
{
  "eventId": "evt_001",
  "eventType": "trial.activated.v1",
  "aggregateId": "claim_001",
  "aggregateVersion": 3,
  "payload": {
    "claimId": "claim_001",
    "userId": "user_001",
    "campaignId": "PREMIUM_7_DAYS",
    "assessmentId": "ra_001",
    "riskScore": 7,
    "riskLevel": "LOW",
    "decision": "ALLOW",
    "groupScores": { "D": 10, "N": 5, "I": 0, "V": 10 },
    "strongGroupCount": 0,
    "reasonCodes": [],
    "activatedAt": "2026-11-04T10:00:00Z",
    "expiresAt": "2026-11-11T10:00:00Z"
  }
}
```

#### `trial.rejected.v1`

```json
{
  "eventId": "evt_002",
  "eventType": "trial.rejected.v1",
  "aggregateId": "claim_002",
  "aggregateVersion": 2,
  "payload": {
    "claimId": "claim_002",
    "userId": "user_002",
    "campaignId": "PREMIUM_7_DAYS",
    "assessmentId": "ra_002",
    "riskScore": 63,
    "riskLevel": "HIGH",
    "decision": "REJECT",
    "groupScores": { "D": 85, "N": 30, "I": 20, "V": 80 },
    "strongGroupCount": 2,
    "reasonCodes": ["DEVICE_SHARED_FP_TRIAL", "VELOCITY_BURST"],
    "rejectedAt": "2026-11-04T10:05:00Z"
  }
}
```

### D. API examples

#### Claim response 201 ACTIVE

```json
{
  "claimId": "claim_001",
  "status": "ACTIVE",
  "riskLevel": "LOW",
  "riskScore": 18,
  "expiresAt": "2026-11-11T10:00:00Z",
  "degraded": false
}
```

#### Claim response 202 PENDING

```json
{
  "claimId": "claim_003",
  "status": "PENDING_RISK_CHECK",
  "degraded": true,
  "reason": "RISK_CHECK_DEFERRED",
  "message": "Yêu cầu đã được lưu và sẽ được đánh giá lại."
}
```

### E. Glossary

Xem mục 3.1.

### F. References

1. Stripe Radar — risk evaluation: <https://docs.stripe.com/radar/transaction-risk-prevention>
2. Stripe — free trial abuse: <https://stripe.com/resources/more/free-trial-abuse>
3. Sift — account creation fraud: <https://sift.com/blog/how-to-detect-and-prevent-account-creation-fraud>
4. Sift — multi-accounting: <https://sift.com/blog/multi-accounting-fraud-marketplaces-igaming>
5. FingerprintJS OSS — limitations: <https://www.npmjs.com/package/@fingerprintjs/fingerprintjs>
6. Fingerprint — confidence score: <https://dev.fingerprint.com/docs/identification-accuracy-and-confidence>
7. Arkose Labs — fake account creation: <https://www.arkoselabs.com/explained/what-is-fake-account-creation>
8. Cloudflare — Account Abuse Protection: <https://blog.cloudflare.com/account-abuse-protection>
9. Ianus — fake account detection at registration: <https://people.duke.edu/~zg70/papers/Ianus.pdf>
10. FRAUDAR — graph fraud/camouflage: <https://bhooi.github.io/papers/fraudar_kdd16.pdf>
11. SybilEdge — early fake account detection: <https://arxiv.org/abs/2004.04834>
12. Preverus — multi-accounting: <https://preverus.com/use-cases/multi-accounting>
13. Castle — signals reference: <https://docs.castle.io/docs/signals-reference>
14. Auth0 — disposable email signup: <https://support.auth0.com/center/s/article/How-to-combat-fradulent-signups-from-disposable-email-services>
15. OWASP Automated Threats — Account Creation Abuse (OAT-019): <https://owasp.github.io/www-project-automated-threats-to-web-applications/assets/oats/EN/OAT-019_Account_Creation.html>
16. PostgreSQL — privileges: <https://www.postgresql.org/docs/current/ddl-priv.html>
17. Neo4j — constraints: <https://neo4j.com/docs/cypher-manual/current/schema/constraints/>
18. RabbitMQ — confirms/DLX: <https://www.rabbitmq.com/docs/confirms> · <https://www.rabbitmq.com/docs/dlx>
19. NestJS — RabbitMQ: <https://docs.nestjs.com/microservices/rabbitmq>
20. NGINX — reverse proxy: <https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/>

---

## 22. KẾT LUẬN

Thiết kế v4 đã chốt:

- **3 service**, dữ liệu riêng.
- **Auto 100%**, không admin trong critical path.
- **S2 dùng 4 nhóm D/N/I/V** + rarity + time decay + `device_stability` server-side.
- **S3 là Case & Investigation Service** có auto-triage, cluster, severity, audit, retention.
- **REST cho quyết định nhanh**, **RabbitMQ cho event**.
- **Outbox S1, inbox S2/S3, DLQ**.
- **2 fault test bắt buộc**, có số liệu.
- **Dataset adversarial + baseline**, không tuyên bố quá mức.

Đây là bản thiết kế đủ chi tiết để bắt đầu code, nhưng vẫn cần kiểm chứng bằng code, test và số liệu thật.
