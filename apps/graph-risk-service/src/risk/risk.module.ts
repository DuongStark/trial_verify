import { Module } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard.js';
import { RiskController } from './risk.controller.js';
import { RiskService } from './risk.service.js';

@Module({
  controllers: [RiskController],
  providers: [RiskService, InternalTokenGuard],
})
export class RiskModule {}
