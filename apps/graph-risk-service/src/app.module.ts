import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health.controller.js';
import { RiskModule } from './risk/risk.module.js';

@Module({
  imports: [RiskModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
