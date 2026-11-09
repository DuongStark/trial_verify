import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function createContext(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization },
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { request, context };
}

describe('JwtAuthGuard', () => {
  it('từ chối khi thiếu header Authorization', async () => {
    const jwt = { verifyAsync: vi.fn() };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('từ chối khi scheme không phải Bearer', async () => {
    const jwt = { verifyAsync: vi.fn() };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService);
    const { context } = createContext('Basic abc123');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('gắn payload vào request khi token hợp lệ', async () => {
    const payload = { sub: 'user-1', role: 'USER' };
    const jwt = { verifyAsync: vi.fn().mockResolvedValue(payload) };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService);
    const { request, context } = createContext('Bearer valid.token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('valid.token');
    expect(request.user).toEqual(payload);
  });

  it('từ chối khi token sai chữ ký hoặc hết hạn', async () => {
    const jwt = {
      verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')),
    };
    const guard = new JwtAuthGuard(jwt as unknown as JwtService);
    const { context } = createContext('Bearer expired.token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
