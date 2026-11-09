import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateClaimDto } from './dto/create-claim.dto.js';
import { TrialsService } from './trials.service.js';
import type { CampaignView, ClaimView } from './trials.service.js';

@Controller('api/trials')
export class TrialsController {
  constructor(private readonly trialsService: TrialsService) {}

  @Get('campaigns')
  @UseGuards(JwtAuthGuard)
  listCampaigns(): Promise<CampaignView[]> {
    return this.trialsService.listActiveCampaigns();
  }

  @Post('claims')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  createClaim(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateClaimDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ClaimView> {
    return this.trialsService.createClaim(user.sub, dto, idempotencyKey);
  }
}
