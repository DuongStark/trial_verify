# Apps

Mỗi thư mục là một service độc lập.

| Thư mục | Service | Database |
|---|---|---|
| `account-trial-service` | S1 Account & Trial | PostgreSQL `account_trial_db` |
| `graph-risk-service` | S2 Graph & Risk | Neo4j |
| `fraud-case-service` | S3 Fraud Case | PostgreSQL `fraud_case_db` |
| `web` | React frontend | Không có DB |

Ở M1, mỗi service sẽ được tạo bằng NestJS và có `GET /health`.
