import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JWT_EXPIRES_IN_SECONDS } from './auth.constants.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;

        if (!secret) {
          // Fail fast khi khởi động thay vì để login lỗi mơ hồ lúc chạy.
          throw new Error('JWT_SECRET chưa được cấu hình');
        }

        return {
          secret,
          signOptions: { expiresIn: JWT_EXPIRES_IN_SECONDS },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // Cho UsersModule dùng lại JwtService và guard thay vì cấu hình JWT lần hai.
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
