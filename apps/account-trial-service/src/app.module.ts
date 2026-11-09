import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { TrialsModule } from './trials/trials.module.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, TrialsModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
