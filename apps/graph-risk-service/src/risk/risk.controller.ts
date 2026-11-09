import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateAssessmentDto } from './dto/create-assessment.dto.js';
import { InternalTokenGuard } from './internal-token.guard.js';
import { RiskService } from './risk.service.js';
import type { AssessmentResult } from './risk.service.js';

@Controller('internal/risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('assessments')
  @UseGuards(InternalTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  assess(@Body() dto: CreateAssessmentDto): AssessmentResult {
    return this.riskService.assess(dto);
  }
}
