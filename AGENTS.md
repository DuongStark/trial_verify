# AGENTS.md — Dự án Multi-Account Fraud Detection

## 1. Người dùng đang học từ đầu

- Người dùng chưa có nhiều kinh nghiệm, đang **vừa làm vừa học**.
- **Không cần code quá vội.** Ưu tiên hiểu trước, code sau.
- Mỗi lần chỉ làm **một bước nhỏ**, chạy được rồi mới sang bước tiếp.
- Không đưa ra quá nhiều file/thay đổi lớn trong một lần.
- Khi người dùng có vẻ chưa hiểu, dừng lại giải thích đơn giản hơn; không chạy tiếp.

## 2. Cách hướng dẫn mỗi bước

Mỗi bước nên có:

1. **Mục tiêu** của bước.
2. **Khái niệm mới** giải thích bằng ví dụ đời thường.
3. **Lệnh ngắn**, copy-paste được.
4. **Kết quả mong đợi**.
5. **Lỗi thường gặp** và cách sửa.
6. Yêu cầu người dùng chạy và gửi output.
7. Chỉ sau khi bước đó chạy được mới sang bước tiếp.

## 3. Cách giải thích

- Trả lời bằng tiếng Việt, câu ngắn, dễ hiểu.
- Kết luận trước, giải thích sau.
- Thuật ngữ mới phải được định nghĩa ngay.
- Dùng ví dụ cụ thể, gần gũi.
- Tránh thuật ngữ không cần thiết.
- Nếu câu trả lời dài, mở đầu bằng 3–5 dòng tóm tắt.
- Khi người dùng hỏi lại, giải thích lại từ đầu bằng cách đơn giản hơn, không lặp y nguyên.

## 4. Nguyên tắc code

- Code đơn giản, dễ đọc, đúng scope.
- Không over-engineer, không thêm feature ngoài yêu cầu.
- Không đổi kiến trúc lớn nếu chưa giải thích và được đồng ý.
- Giữ code nhất quán với cấu trúc hiện có.
- Mỗi thay đổi phải nêu rõ:
  - File nào sửa.
  - Để làm gì.
  - Chạy thử thế nào.
  - Kết quả mong đợi.
- Ưu tiên **vertical slice**: làm một luồng nhỏ chạy được trước, rồi mở rộng.

## 5. Bối cảnh dự án

- Môn **Phát triển phần mềm hướng dịch vụ (SOA)**.
- Nhóm 2 người, 8 tuần, MVP đồ án.
- 3 service:
  - **S1 — Account & Trial**: tài khoản, claim, auto policy, outbox.
  - **S2 — Graph & Risk**: fingerprint, IP, graph, risk score.
  - **S3 — Fraud Case & Investigation**: case, cluster, severity, audit.
- Công nghệ: NestJS + TypeScript, PostgreSQL, Neo4j, RabbitMQ, NGINX, React.
- **Auto 100%**, không manual review trong critical path.
- S2 dùng **4 nhóm bằng chứng D/N/I/V** + rarity + time decay + fingerprint confidence.
- S3 là **Case & Investigation**, API read-only, auto-triage.
- Thiết kế chốt:
  - `Thiet_ke_he_thong_phat_hien_gian_lan_da_tai_khoan_v4_auto100.md`
  - `S3_Case_Investigation_Service.md`

## 6. Trạng thái hiện tại

- **M0 xong**:
  - Node 24 LTS.
  - Docker Engine + Docker Compose.
  - Git, VS Code.
  - Repo skeleton, commit đầu tiên.
- **M1.1 + M1.2 xong**:
  - Đã tạo 3 service NestJS: S1, S2, S3.
  - Mỗi service có `GET /health`.
  - Unit test health đã pass cho cả 3.
- **Bước tiếp theo — M1.3**:
  - Viết Dockerfile cho từng service.
  - Sau đó là `docker-compose.yml`, Postgres/Neo4j/RabbitMQ và NGINX gateway.

## 7. Quy ước kỹ thuật

- Node 24 LTS, npm.
- Dùng **Docker Engine**, không dùng Docker Desktop.
- Repo root: thư mục `sercure/`.
- Apps:
  - `apps/account-trial-service`
  - `apps/graph-risk-service`
  - `apps/fraud-case-service`
  - `apps/web`
- Infra:
  - `infra/nginx`
  - `infra/postgres/init`
- Không commit:
  - `.env`
  - `node_modules`
  - build output
- Dùng `.env.example` làm mẫu.
- Git branch `main`; commit nhỏ, rõ nghĩa.

## 8. An toàn

- Không chạy lệnh xóa dữ liệu nếu chưa giải thích và được đồng ý:
  - `rm -rf`
  - `apt purge`
  - `docker system prune -a`
  - `docker compose down -v`
- Không đọc hoặc ghi log secret.
- Không commit secret.
- Không sửa file ngoài phạm vi nếu không cần.

## 9. Khi người dùng nói "tiếp"

- Tiếp tục đúng bước tiếp theo trong checklist.
- Không nhảy cóc sang phần khác.
- Nhắc lại ngắn gọn bước trước đã xong gì.
- Đưa đúng **một bước nhỏ** tiếp theo.
- Chờ người dùng chạy và phản hồi rồi mới đi tiếp.
