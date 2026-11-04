# M0 — Checklist cài đặt môi trường

> Mục tiêu: máy chạy được Node.js LTS, Docker, Git, VS Code và có repo trống sẵn sàng cho M1.
> Làm xong từng phần, đánh dấu `[x]`.

---

## M0.1 — Kiểm tra máy hiện có gì

Mở Terminal, chạy:

```bash
node -v
npm -v
docker --version
docker compose version
git --version
code --version
```

Kết quả mong đợi:

- `node -v`: có phiên bản LTS (ví dụ `v24.x` hoặc `v26.x`).
- `npm -v`: có phiên bản.
- `docker --version`: có.
- `docker compose version`: có.
- `git --version`: có.
- `code --version`: có.

Nếu thiếu gì, làm phần tương ứng bên dưới.

---

## M0.2 — Đưa Node.js về bản LTS

### Vì sao?

- **Node.js** là môi trường chạy JavaScript/TypeScript ngoài trình duyệt.
- **LTS** = Long Term Support, bản ổn định lâu dài.
- Bản **Current** (ví dụ v25) có thể chưa được thư viện hỗ trợ tốt.

### Nếu đã có `nvm`

```bash
source ~/.nvm/nvm.sh
nvm install --lts
nvm use --lts
nvm alias default 'lts/*'
node -v
npm -v
```

### Nếu `nvm` chưa có

Cài `nvm` theo hướng dẫn chính thức:

<https://github.com/nvm-sh/nvm>

Sau đó chạy lại các lệnh trên.

### Xong khi

```bash
node -v
```

ra phiên bản LTS, không phải bản lẻ như `v25.x`.

---

## M0.3 — Cài Docker Engine + Docker Compose

### Vì sao?

Dự án cần chạy nhiều thứ cùng lúc:

- PostgreSQL
- Neo4j
- RabbitMQ
- 3 service NestJS
- NGINX

**Docker** giúp mỗi thứ chạy trong một **container** — môi trường đóng gói riêng, không cài lộn xộn vào máy.

**Docker Compose** giúp chạy tất cả bằng một lệnh `docker compose up`.

### Cài trên Ubuntu 24.04

Chạy từng khối lệnh:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
```

```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### Quan trọng: nhóm docker

Sau lệnh `usermod`, bạn phải **đăng xuất rồi đăng nhập lại**, hoặc chạy:

```bash
newgrp docker
```

Nếu không, `docker` sẽ báo `permission denied`.

### Kiểm tra

```bash
docker --version
docker compose version
docker run hello-world
```

Nếu thấy dòng `Hello from Docker!` là thành công.

### Nếu lỗi

- `docker: command not found` → chưa cài xong.
- `permission denied` → chưa logout/login hoặc chưa vào nhóm `docker`.
- `Cannot connect to the Docker daemon` → chạy:
  ```bash
  sudo systemctl start docker
  ```

---

## M0.4 — Cấu hình Git và VS Code

### Git

```bash
git config --global user.name "Tên của bạn"
git config --global user.email "email@example.com"
git config --global init.defaultBranch main
```

Kiểm tra:

```bash
git config --global --list
```

### VS Code extensions

Mở VS Code, cài các extension sau (hoặc dùng lệnh):

```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ms-azuretools.vscode-docker
code --install-extension Prisma.prisma
code --install-extension humao.rest-client
```

Tùy chọn:

```bash
code --install-extension eamodio.gitlens
```

### Postman

Chưa cần cho M0. Cài sau ở M8 hoặc khi test API.

---

## M0.5 — Tạo repo skeleton

Từ thư mục dự án:

```bash
cd "/media/duongstark/Du lieu/code/sercure"
mkdir -p apps/account-trial-service
mkdir -p apps/graph-risk-service
mkdir -p apps/fraud-case-service
mkdir -p infra/nginx
mkdir -p infra/postgres/init
git init
```

Tạo các file:

- `README.md`
- `.gitignore`
- `.env.example`
- `apps/README.md`
- `infra/README.md`

### `.gitignore` gợi ý

```gitignore
node_modules/
dist/
build/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode/
.idea/
```

### `.env.example` gợi ý

```dotenv
NODE_ENV=development
ACCOUNT_PORT=3001
RISK_PORT=3002
CASE_PORT=3003
ACCOUNT_DATABASE_URL=postgresql://account_svc:change_me@postgres:5432/account_trial_db
CASE_DATABASE_URL=postgresql://case_svc:change_me@postgres:5432/fraud_case_db
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=change_me
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
JWT_SECRET=change_me
FP_HMAC_SECRET=change_me
INTERNAL_SERVICE_TOKEN=change_me
```

### Xong khi

```bash
git status
```

thấy repo mới, có các thư mục `apps/`, `infra/`.

---

## M0.6 — Kiểm tra tổng thể và commit đầu tiên

Chạy:

```bash
node -v
npm -v
docker --version
docker compose version
docker run hello-world
git --version
git status
```

Sau đó:

```bash
git add .
git commit -m "chore: initialize project skeleton"
```

### M0 hoàn thành khi

- [ ] Node.js LTS
- [ ] npm chạy
- [ ] Docker Engine chạy
- [ ] Docker Compose chạy
- [ ] `docker run hello-world` thành công
- [ ] Git đã cấu hình name/email
- [ ] Repo đã init
- [ ] Có `.gitignore`, `.env.example`, `README.md`
- [ ] Commit đầu tiên

---

## Ghi chú

- Không commit file `.env` thật.
- Không cài PostgreSQL/Neo4j/RabbitMQ trực tiếp lên máy; sẽ chạy bằng Docker ở M1.
- Nếu lệnh nào lỗi, copy nguyên đoạn lỗi để cùng sửa.
