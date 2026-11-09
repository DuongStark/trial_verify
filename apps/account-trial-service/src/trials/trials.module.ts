import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RiskClient } from './risk-client.service.js';
import { TrialsController } from './trials.controller.js';
import { TrialsService } from './trials.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TrialsController],
  providers: [TrialsService, RiskClient],
})
export class TrialsModule {}
