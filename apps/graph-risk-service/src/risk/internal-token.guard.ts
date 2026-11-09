import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-internal-token'];
    const expected = process.env.INTERNAL_SERVICE_TOKEN;

    if (!expected || token !== expected) {
      throw new UnauthorizedException({
        code: 'INVALID_INTERNAL_TOKEN',
        message: 'Internal token không hợp lệ',
      });
    }

    return true;
  }
}
