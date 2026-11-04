# Infra

Hạ tầng dùng chung, không chứa logic nghiệp vụ.

| Thư mục | Nội dung |
|---|---|
| `nginx/` | Cấu hình API Gateway |
| `postgres/init/` | Script tạo 2 database và user riêng |

Ở M1, ta sẽ thêm:

- `nginx/nginx.conf` hoặc `default.conf`
- `postgres/init/01-create-databases.sql`
- Dockerfile cho từng service
- `docker-compose.yml` ở thư mục gốc
