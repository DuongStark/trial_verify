# S3 — Fraud Case & Investigation Service

> Bản đặc tả này thay thế phần “S3 chỉ là hàng đợi review tay” trong thiết kế cũ.
> Mục tiêu: S3 vẫn tự động 100%, nhưng có **nghiệp vụ thật** để không bị xem là service thừa.

---

## 1. Một câu dễ hiểu

- **S1** quyết định: “Tài khoản này có được dùng thử không?”
- **S2** chấm điểm: “Claim này đáng ngờ đến mức nào?”
- **S3** giữ hồ sơ: “Vụ việc này thuộc nhóm nào, ưu tiên điều tra ra sao, bằng chứng và lịch sử đâu?”

Ví dụ đời thường:

- S1 là nhân viên duyệt hồ sơ.
- S2 là máy chấm điểm rủi ro.
- S3 là người lập hồ sơ điều tra: ghim các hồ sơ liên quan lại với nhau, đánh dấu hồ sơ nào cần xem trước, lưu bằng chứng, và làm báo cáo.

S3 **không** cấp/từ chối trial. S3 chỉ xử lý **sau khi** S1 đã có quyết định.

---

## 2. Vì sao S3 không bị thừa

Nếu S3 chỉ nhận event rồi trả `GET /api/cases`, nó giống một bảng đọc/audit — có thể gộp vào S1. Để tách riêng có lý do, S3 phải sở hữu những việc sau:

| Việc của S3 | Vì sao không đặt ở S1/S2 |
|---|---|
| Quản lý vòng đời hồ sơ (case) | Hồ sơ có thể sống lâu hơn trial, cần lưu retention riêng |
| Ghép các case liên quan thành cụm | Đây là nghiệp vụ điều tra, không phải quyết định cấp trial |
| Tính mức ưu tiên điều tra P1/P2/P3 | Khác với risk score của từng claim |
| Lưu audit bất biến (append-only) | Cần bảng riêng, không sửa/xóa |
| Dashboard gian lận | Truy vấn khác hoàn toàn với S1/S2 |
| Nhận event bất đồng bộ + DLQ | Nơi tự nhiên để chứng minh RabbitMQ consumer idempotent |

**Tóm lại:** S2 trả lời “claim này có rủi ro không?”. S3 trả lời “hồ sơ này thuộc cụm nào, ưu tiên ra sao, lưu vết thế nào?”. Hai câu hỏi khác nhau.

---

## 3. Phạm vi

### Làm trong MVP

- Nhận event quyết định cuối từ S1.
- Tạo case, chống trùng theo `claim_id`.
- Bổ sung dữ liệu đồ thị từ S2 (enrichment).
- Ghép case vào cụm, tính severity P1/P2/P3.
- Lưu audit append-only.
- Tự đóng case theo retention.
- Dashboard + API đọc.
- Consumer idempotent + DLQ.
- Chịu lỗi khi S2 down.

### Không làm trong MVP

- Admin duyệt/từ chối trial.
- S3 gọi S1 để đổi trạng thái trial.
- Appeal workflow.
- Xóa dữ liệu thật khỏi DB.
- ML/analytics nâng cao.
- Chat/notification.

---

## 4. Quy tắc nghiệp vụ

| Mã | Quy tắc | Giải thích dễ hiểu |
|---|---|---|
| BR-S3-01 | Mỗi `claim_id` có tối đa một case | Một claim không thể sinh ra hai hồ sơ |
| BR-S3-02 | Chỉ tạo case từ quyết định cuối | `trial.rejected` hoặc `trial.activated` với riskLevel khác LOW |
| BR-S3-03 | Case event và audit là append-only | Chỉ ghi thêm; không sửa/xóa lịch sử |
| BR-S3-04 | Case phải được enrich từ graph của S2 | Lấy các user liên quan để ghép cụm |
| BR-S3-05 | S2 lỗi không được làm mất case | Case vẫn tạo; enrichment chuyển `PENDING` và retry |
| BR-S3-06 | Case liên quan trong 30 ngày thì ghép cụm | Cùng user, cùng campaign, hoặc cùng nhóm graph |
| BR-S3-07 | Severity P1/P2/P3 chỉ để ưu tiên điều tra | Không dùng để cấp/từ chối trial |
| BR-S3-08 | Case tự đóng theo retention | P1 giữ lâu hơn P3; không cần admin |
| BR-S3-09 | Chỉ ADMIN xem case detail | USER chỉ xem trạng thái claim của mình |
| BR-S3-10 | Event lặp không tạo case trùng | Inbox theo `eventId` + unique `claim_id` |
| BR-S3-11 | Nếu S2 chết, graph view trả 503/504 | Case detail vẫn xem được |
| BR-S3-12 | Không có endpoint quyết định trial | S3 không nằm trong critical path |

---

## 5. Trạng thái

### 5.1. Trạng thái case

```text
OPEN
  ├─ enrich xong        → vẫn OPEN, enrichment_status = DONE
  ├─ enrich lỗi tạm     → vẫn OPEN, enrichment_status = PENDING
  ├─ enrich lỗi nặng    → vẫn OPEN, enrichment_status = FAILED
  └─ hết retention      → CLOSED
```

- `OPEN`: hồ sơ đang được theo dõi.
- `CLOSED`: hết thời hạn lưu hoặc trial đã kết thúc.
- Không có `PENDING_REVIEW`, `APPROVED`, `REJECTED` vì S3 không quyết định trial.

### 5.2. Trạng thái enrichment

| Giá trị | Nghĩa |
|---|---|
| `PENDING` | Chưa lấy được dữ liệu graph |
| `PARTIAL` | Lấy được một phần, còn lỗi |
| `DONE` | Đã ghép cụm và tính severity |
| `FAILED` | Retry quá số lần; vẫn giữ case để xem thủ công sau |

### 5.3. Severity

| Mức | Nghĩa | Ví dụ |
|---|---|---|
| `P1` | Ưu tiên cao nhất | HIGH + nhiều case liên quan + tái phạm |
| `P2` | Ưu tiên trung bình | MEDIUM + có case liên quan |
| `P3` | Ưu tiên thấp | Case đơn lẻ, ít tín hiệu |

---

## 6. Dữ liệu

### 6.1. `fraud_cases`

```sql
CREATE TABLE fraud_cases (
  case_id UUID PRIMARY KEY,
  claim_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  campaign_id TEXT NOT NULL,
  assessment_id TEXT,
  decision TEXT NOT NULL,          -- AUTO_REJECT | VERIFIED_MONITORED | VERIFICATION_FAILED
  risk_score INT,
  risk_level TEXT,                 -- LOW | MEDIUM | HIGH
  reason_codes JSONB NOT NULL DEFAULT '[]',
  cluster_key TEXT,                -- case_id nhỏ nhất trong cụm
  severity TEXT,                   -- P1 | P2 | P3
  severity_reasons JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,            -- OPEN | CLOSED
  enrichment_status TEXT NOT NULL, -- PENDING | PARTIAL | DONE | FAILED
  graph_status TEXT,               -- OK | UNAVAILABLE
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cases_status_severity
  ON fraud_cases(status, severity, opened_at DESC);

CREATE INDEX idx_cases_user_time
  ON fraud_cases(user_id, opened_at DESC);

CREATE INDEX idx_cases_cluster
  ON fraud_cases(cluster_key);
```

### 6.2. `case_links`

```sql
CREATE TABLE case_links (
  case_id UUID NOT NULL REFERENCES fraud_cases(case_id),
  related_case_id UUID NOT NULL REFERENCES fraud_cases(case_id),
  link_type TEXT NOT NULL, -- SAME_USER | SAME_CAMPAIGN | SAME_CLUSTER | SAME_FINGERPRINT | SAME_IP
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, related_case_id)
);
```

### 6.3. `case_events`

```sql
CREATE TABLE case_events (
  event_id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES fraud_cases(case_id),
  event_type TEXT NOT NULL, -- CASE_CREATED | CASE_ENRICHED | CASE_LINKED | CASE_CLOSED | AUDIT_RECORDED
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_events_case_time
  ON case_events(case_id, created_at);
```

> `case_events` chỉ insert, không update/delete. Đây là lịch sử hồ sơ.

### 6.4. `s3_inbox`

```sql
CREATE TABLE s3_inbox (
  event_id UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.5. `security_audit_events`

```sql
CREATE TABLE security_audit_events (
  event_id UUID PRIMARY KEY,
  claim_id UUID,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. API

Tất cả API public đi qua Gateway. S3 không có endpoint quyết định trial.

| Method | Endpoint | Thành công | Lỗi nghiệp vụ |
|---|---|---|---|
| GET | `/api/cases` | 200 | 422 filter sai |
| GET | `/api/cases/{caseId}` | 200 | 404 `CASE_NOT_FOUND` |
| GET | `/api/cases/{caseId}/events` | 200 | 404 |
| GET | `/api/cases/{caseId}/related` | 200 | 404 |
| GET | `/api/cases/{caseId}/graph?depth=2&limit=100` | 200 | 422 `GRAPH_DEPTH_LIMIT_EXCEEDED`; 503/504 nếu S2 lỗi/chậm |
| GET | `/api/dashboard/overview` | 200 | 403 `NOT_ADMIN` |
| GET | `/health` | 200 | — |
| GET | `/ready` | 200 | 503 nếu DB down |

### Ví dụ `GET /api/cases/{caseId}`

```json
{
  "caseId": "case_001",
  "claimId": "claim_001",
  "userId": "user_001",
  "campaignId": "PREMIUM_7_DAYS",
  "decision": "AUTO_REJECT",
  "riskScore": 75,
  "riskLevel": "HIGH",
  "reasonCodes": ["SHARED_FP_PREVIOUS_TRIAL", "RAPID_RELATED_SIGNUPS"],
  "clusterKey": "case_001",
  "severity": "P1",
  "status": "OPEN",
  "enrichmentStatus": "DONE",
  "openedAt": "2026-11-04T10:00:00Z",
  "relatedCaseIds": ["case_002"]
}
```

---

## 8. Luồng event

### 8.1. S3 nhận gì?

| Event | S3 làm gì |
|---|---|
| `trial.rejected.v1` | Tạo case `AUTO_REJECT` hoặc `VERIFICATION_FAILED` |
| `trial.activated.v1` với `riskLevel != LOW` | Tạo case `VERIFIED_MONITORED` |
| `trial.activated.v1` với `riskLevel = LOW` | Chỉ ghi audit, không tạo case |
| `trial.expired.v1` | Đóng case nếu có |
| `trial.claim_audit.v1` | Ghi `security_audit_events` |

### 8.2. Consumer làm đúng thứ tự

1. Mở transaction PostgreSQL.
2. Kiểm tra `s3_inbox` theo `eventId`; nếu đã có thì commit/ack và bỏ qua.
3. Nếu là event tạo case:
   - Kiểm tra `fraud_cases.claim_id` đã tồn tại chưa.
   - Nếu chưa: insert case + `CASE_CREATED` event.
   - Nếu rồi: bỏ qua.
4. Insert `s3_inbox`.
5. Commit.
6. Ack message.

> Ack **sau khi commit**. Nếu commit lỗi, không ack; RabbitMQ sẽ giao lại.

### 8.3. Enrichment worker

Chạy nền, không chặn consumer:

1. Tìm case có `enrichment_status = PENDING` và `next_enrich_at <= now()`.
2. Gọi S2:
   ```http
   GET /internal/graph/users/{userId}/neighbors?depth=1&limit=50
   ```
3. Nhận danh sách user liên quan.
4. Tìm case của các user đó trong 30 ngày.
5. Nếu có:
   - Tạo `case_links`.
   - Chọn `cluster_key` = `case_id` nhỏ nhất trong cụm.
   - Cập nhật `cluster_key` cho các case liên quan nếu cần.
6. Tính severity.
7. Cập nhật case:
   - `enrichment_status = DONE`
   - `graph_status = OK`
   - `severity`, `severity_reasons`
8. Append `CASE_ENRICHED` + `CASE_LINKED` event.
9. Nếu S2 lỗi:
   - `graph_status = UNAVAILABLE`
   - `enrichment_status` giữ `PENDING` hoặc `PARTIAL`
   - `next_enrich_at = now() + backoff`
   - Retry tối đa N lần; sau đó `FAILED`, nhưng case vẫn còn.

---

## 9. Cách tính severity

### 9.1. Công thức dễ hiểu

```text
Bắt đầu từ risk level:
  HIGH   → P1
  MEDIUM → P2
  LOW    → P3

Nếu có >= 2 case liên quan trong 30 ngày: nâng 1 mức
Nếu reasonCodes có F1/F2/F5:            nâng 1 mức

Không thấp hơn P3, không cao hơn P1.
```

### 9.2. Ví dụ

| Case | Risk | Case liên quan | Reason | Kết quả |
|---|---|---|---:|---|
| A | HIGH | 0 | Không | P1 |
| B | MEDIUM | 2 | Có F1 | P1 |
| C | MEDIUM | 0 | Không | P2 |
| D | LOW | 0 | Không | P3 |
| E | HIGH | 3 | Có F2 | P1 |

### 9.3. Vì sao không dùng severity để cấp trial?

Vì severity là **ưu tiên điều tra sau khi đã có quyết định**. Nếu dùng nó để cấp trial, S3 sẽ thành nơi ra quyết định thứ hai, gây trùng lặp với S2 và làm luồng phức tạp lại.

---

## 10. Xử lý lỗi

| Tình huống | Hành vi đúng |
|---|---|
| S3 down | RabbitMQ giữ message; S3 lên xử lý lại; inbox chống trùng |
| S2 down khi enrich | Case vẫn tạo; enrichment `PENDING`; retry; graph API trả 503/504 |
| Event gửi lặp | `s3_inbox` bỏ qua; unique `claim_id` chống case trùng |
| Event sai schema | Không ack; retry có giới hạn; sau đó DLQ |
| DB S3 down | Không ack; RabbitMQ giao lại; retry |
| Case hết retention | Job tự đóng; append `CASE_CLOSED` |
| S2 chậm khi xem graph | Timeout 3s; trả 504; retry có điều kiện |

---

## 11. Test cần có

| ID | Kịch bản | Kỳ vọng |
|---|---|---|
| TC-S3-01 | Nhận `trial.rejected` | Tạo 1 case |
| TC-S3-02 | Gửi lặp cùng `eventId` | Không tạo case thứ hai |
| TC-S3-03 | Hai event khác `eventId` cùng `claimId` | Unique `claim_id` chặn case trùng |
| TC-S3-04 | S2 down khi enrich | Case vẫn có; `enrichment_status=PENDING` |
| TC-S3-05 | S2 lên lại | Worker enrich xong; severity được cập nhật |
| TC-S3-06 | 3 case cùng user trong 30 ngày | Ghép cụm; severity tăng |
| TC-S3-07 | `GET /graph?depth=5` | 422 |
| TC-S3-08 | S2 down khi `GET /graph` | 503/504, không trả dữ liệu giả |
| TC-S3-09 | Event sai schema | Vào DLQ |
| TC-S3-10 | Hết retention | Case `CLOSED`, có `CASE_CLOSED` event |

---

## 12. Đối chiếu với đề bài

| Yêu cầu | S3 đáp ứng |
|---|---|
| ≥4 REST endpoint | 6 endpoint public |
| ≥1 lỗi nghiệp vụ 4xx | 422 `GRAPH_DEPTH_LIMIT_EXCEEDED` |
| Dữ liệu riêng | `fraud_case_db` |
| OpenAPI riêng | `fraud-case.openapi.yaml` |
| Luồng nhiều bước | S1 → RabbitMQ → S3; S3 → S2 graph |
| Xử lý lỗi giữa chừng | S3 down → queue; S2 down → enrichment pending |
| RabbitMQ bonus | consumer idempotent + DLQ |
| Fault test | S3 down; S2 down khi enrich/graph |

---

## 13. Khi nào nên gộp S3 vào S1?

Nếu nhóm 2 người và thời gian eo hẹp, gộp là phương án hợp lý:

- S1 sở hữu luôn bảng case/audit.
- RabbitMQ bonus vẫn dùng được qua luồng S1 → S2 projection.
- Giảm 1 service, 1 DB, 1 Dockerfile, 1 OpenAPI, 1 bộ API.
- Đề nhóm 2 người chỉ yêu cầu tối thiểu 2 service, nên vẫn đạt.

**Điều kiện để giữ S3:** S3 phải có auto-triage + cluster + severity + audit/retention như trên. Nếu chỉ read-only, hãy gộp.

---

## 14. Tóm tắt một dòng

> S3 không quyết định trial; S3 biến quyết định thành **hồ sơ điều tra có cụm, có mức ưu tiên, có audit, có retention** — đó là nghiệp vụ thật để service này đáng tồn tại.
