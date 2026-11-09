import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { BCRYPT_ROUNDS, JWT_EXPIRES_IN_SECONDS } from './auth.constants.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

export interface RegisterResult {
  userId: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    // Chuẩn hóa để "A@B.com" và "a@b.com" là cùng một tài khoản.
    const emailNormalized = dto.email.trim().toLowerCase();
    const emailDomainKey = emailNormalized.split('@')[1] ?? '';

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    try {
      const account = await this.prisma.account.create({
        data: {
          emailNormalized,
          emailDomainKey,
          passwordHash,
        },
        select: {
          userId: true,
          emailNormalized: true,
          role: true,
          createdAt: true,
        },
      });

      this.logger.log(`Đã tạo tài khoản ${account.userId}`);

      return {
        userId: account.userId,
        email: account.emailNormalized,
        role: account.role,
        createdAt: account.createdAt,
      };
    } catch (error) {
      // unique constraint (email_normalized) là chốt chặn cuối:
      // hai request đăng ký cùng email có thể chạy song song.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email đã được đăng ký',
        });
      }

      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const emailNormalized = dto.email.trim().toLowerCase();

    const account = await this.prisma.account.findUnique({
      where: { emailNormalized },
      select: {
        userId: true,
        passwordHash: true,
        role: true,
      },
    });

    const passwordMatches = account
      ? await compare(dto.password, account.passwordHash)
      : false;

    // Cùng một thông báo cho "email không tồn tại" và "sai mật khẩu":
    // tránh để kẻ tấn công dò xem email nào đã đăng ký.
    if (!account || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không đúng',
      });
    }

    const accessToken = await this.jwtService.signAsync({
      sub: account.userId,
      role: account.role,
    });

    this.logger.log(`Đăng nhập thành công ${account.userId}`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    };
  }
}
