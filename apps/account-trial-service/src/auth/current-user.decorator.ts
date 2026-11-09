import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './auth.types.js';

// Lấy payload JWT mà JwtAuthGuard đã gắn vào request.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload }>();

    return request.user;
  },
);
