import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

interface CreateArgs {
  data: {
    emailNormalized: string;
    emailDomainKey: string;
    passwordHash: string;
  };
}

function createPrismaMock() {
  return {
    account: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

function createJwtMock() {
  return {
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
  };
}

describe('AuthService', () => {
  it('chuẩn hóa email và hash mật khẩu trước khi lưu', async () => {
    const prisma = createPrismaMock();
    let captured: CreateArgs | undefined;

    prisma.account.create.mockImplementation((args: CreateArgs) => {
      captured = args;
      return Promise.resolve({
        userId: 'user-1',
        emailNormalized: args.data.emailNormalized,
        role: 'USER',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    const service = new AuthService(
      prisma as unknown as PrismaService,
      createJwtMock() as never,
    );
    const result = await service.register({
      email: '  Alice@Example.COM ',
      password: 'mat-khau-123',
    });

    expect(result).toEqual({
      userId: 'user-1',
      email: 'alice@example.com',
      role: 'USER',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(captured?.data.emailNormalized).toBe('alice@example.com');
    expect(captured?.data.emailDomainKey).toBe('example.com');
    expect(captured?.data.passwordHash).not.toBe('mat-khau-123');
    expect(await compare('mat-khau-123', captured!.data.passwordHash)).toBe(
      true,
    );
  });

  it('trả 409 EMAIL_ALREADY_EXISTS khi unique constraint bị vi phạm', async () => {
    const prisma = createPrismaMock();
    prisma.account.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    const service = new AuthService(
      prisma as unknown as PrismaService,
      createJwtMock() as never,
    );

    await expect(
      service.register({ email: 'alice@example.com', password: 'mat-khau-123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('đăng nhập đúng trả JWT với userId và role', async () => {
    const prisma = createPrismaMock();
    const jwt = createJwtMock();
    const passwordHash = await hash('mat-khau-123', 4);

    prisma.account.findUnique.mockResolvedValue({
      userId: 'user-1',
      passwordHash,
      role: 'USER',
    });

    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as never,
    );
    const result = await service.login({
      email: 'Alice@Example.com',
      password: 'mat-khau-123',
    });

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { emailNormalized: 'alice@example.com' },
      select: { userId: true, passwordHash: true, role: true },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      role: 'USER',
    });
    expect(result).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
  });

  it('sai mật khẩu trả 401 INVALID_CREDENTIALS', async () => {
    const prisma = createPrismaMock();
    prisma.account.findUnique.mockResolvedValue({
      userId: 'user-1',
      passwordHash: await hash('mat-khau-123', 4),
      role: 'USER',
    });

    const service = new AuthService(
      prisma as unknown as PrismaService,
      createJwtMock() as never,
    );

    await expect(
      service.login({ email: 'alice@example.com', password: 'sai-mat-khau' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('email không tồn tại cũng trả 401, không tiết lộ email đã đăng ký', async () => {
    const prisma = createPrismaMock();
    prisma.account.findUnique.mockResolvedValue(null);

    const service = new AuthService(
      prisma as unknown as PrismaService,
      createJwtMock() as never,
    );

    await expect(
      service.login({ email: 'khong-ton-tai@example.com', password: 'bat-ky' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
