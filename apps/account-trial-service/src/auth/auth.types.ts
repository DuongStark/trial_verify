// Payload mà server nhét vào JWT khi đăng nhập.
// `sub` là userId theo chuẩn JWT (subject).
export interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}
