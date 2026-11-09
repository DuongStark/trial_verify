import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard.js';

function createContext(token?: string): ExecutionContext {
  const request = { headers: { 'x-internal-token': token } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('InternalTokenGuard', () => {
  const original = process.env.INTERNAL_SERVICE_TOKEN;

  beforeAll(() => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
  });

  afterAll(() => {
    process.env.INTERNAL_SERVICE_TOKEN = original;
  });

  it('từ chối khi thiếu token', () => {
    const guard = new InternalTokenGuard();

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối khi token sai', () => {
    const guard = new InternalTokenGuard();

    expect(() => guard.canActivate(createContext('sai-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('cho qua khi token đúng', () => {
    const guard = new InternalTokenGuard();

    expect(guard.canActivate(createContext('internal-secret'))).toBe(true);
  });
});
