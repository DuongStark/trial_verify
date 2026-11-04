-- Chỉ chạy khi PostgreSQL volume được tạo lần đầu.
-- Đây là mật khẩu dev local, không dùng cho production.

CREATE USER account_svc WITH PASSWORD 'account_pass';
CREATE USER case_svc WITH PASSWORD 'case_pass';

CREATE DATABASE account_trial_db OWNER account_svc;
CREATE DATABASE fraud_case_db OWNER case_svc;

REVOKE ALL ON DATABASE account_trial_db FROM PUBLIC;
REVOKE ALL ON DATABASE fraud_case_db FROM PUBLIC;

GRANT CONNECT ON DATABASE account_trial_db TO account_svc;
GRANT CONNECT ON DATABASE fraud_case_db TO case_svc;
