import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

function createPrismaMock() {
  return {
    account: {
      findUnique: vi.fn(),
    },
  };
}

describe('UsersService', () => {
  it('trả profile đã lọc, không có passwordHash', async () => {
    const prisma = createPrismaMock();
    prisma.account.findUnique.mockResolvedValue({
      userId: 'user-1',
      emailNormalized: 'alice@example.com',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      passwordHash: '$2b$12$hidden',
    });

    const service = new UsersService(prisma as unknown as PrismaService);
    const result = await service.getProfile('user-1');

    expect(result).toEqual({
      userId: 'user-1',
      email: 'alice@example.com',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('trả 404 khi tài khoản không còn tồn tại', async () => {
    const prisma = createPrismaMock();
    prisma.account.findUnique.mockResolvedValue(null);

    const service = new UsersService(prisma as unknown as PrismaService);

    await expect(service.getProfile('user-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
