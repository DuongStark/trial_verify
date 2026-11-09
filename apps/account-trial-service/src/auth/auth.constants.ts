// 12 rounds ~ 250-400ms mỗi lần hash: đủ chậm để chống dò mật khẩu,
// vẫn chấp nhận được cho demo.
export const BCRYPT_ROUNDS = 12;

// Token sống 1 giờ. Đủ cho demo; production thường dùng access token ngắn
// hơn (5-15 phút) kèm refresh token.
export const JWT_EXPIRES_IN_SECONDS = 3600;
