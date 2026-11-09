import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface UserProfile {
  userId: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
      select: {
        userId: true,
        emailNormalized: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!account) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản',
      });
    }

    // Không trả passwordHash hoặc dữ liệu nội bộ khác.
    return {
      userId: account.userId,
      email: account.emailNormalized,
      role: account.role,
      status: account.status,
      emailVerified: account.emailVerified,
      createdAt: account.createdAt,
    };
  }
}
