import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClaimDto } from './dto/create-claim.dto.js';
import { RiskClient } from './risk-client.service.js';

const CLAIM_SELECT = {
  claimId: true,
  campaignId: true,
  status: true,
  evaluationVersion: true,
  assessmentId: true,
  riskScore: true,
  riskLevel: true,
  decision: true,
  requestedAt: true,
  expiresAt: true,
} as const;

export interface CampaignView {
  campaignId: string;
  name: string;
  durationDays: number;
  active: boolean;
}

export interface ClaimView {
  claimId: string;
  campaignId: string;
  status: string;
  evaluationVersion: number;
  assessmentId: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  decision: string | null;
  requestedAt: Date;
  expiresAt: Date | null;
}

@Injectable()
export class TrialsService {
  private readonly logger = new Logger(TrialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskClient: RiskClient,
  ) {}

  // Chỉ trả campaign đang bật; campaign tắt không nên xuất hiện cho user.
  listActiveCampaigns(): Promise<CampaignView[]> {
    return this.prisma.trialCampaign.findMany({
      where: { active: true },
      select: {
        campaignId: true,
        name: true,
        durationDays: true,
        active: true,
      },
      orderBy: { campaignId: 'asc' },
    });
  }

  async createClaim(
    userId: string,
    dto: CreateClaimDto,
    idempotencyKey?: string,
  ): Promise<ClaimView> {
    const key = idempotencyKey?.trim();

    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Thiếu header Idempotency-Key',
      });
    }

    if (key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key quá dài (tối đa 128 ký tự)',
      });
    }

    const campaign = await this.prisma.trialCampaign.findUnique({
      where: { campaignId: dto.campaignId },
      select: { active: true },
    });

    if (!campaign || !campaign.active) {
      throw new UnprocessableEntityException({
        code: 'CAMPAIGN_INACTIVE',
        message: 'Campaign không tồn tại hoặc đã tắt',
      });
    }

    // Theo thiết kế: chỉ hash campaignId, không đưa fingerprint vào.
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ campaignId: dto.campaignId }))
      .digest('hex');

    let claim: ClaimView;

    try {
      // Claim và outbox audit phải sống chết cùng nhau.
      claim = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trialClaim.create({
          data: {
            userId,
            campaignId: dto.campaignId,
            idempotencyKey: key,
            requestHash,
          },
          select: CLAIM_SELECT,
        });

        await tx.outboxEvent.create({
          data: {
            aggregateId: created.claimId,
            aggregateVersion: 1,
            eventType: 'trial.claim_audit.v1',
            payloadJson: {
              claimId: created.claimId,
              userId,
              campaignId: created.campaignId,
              status: created.status,
              requestedAt: created.requestedAt.toISOString(),
            },
          },
        });

        return created;
      });
    } catch (error) {
      // Hai request đồng thời có thể cùng lọt qua bước kiểm tra.
      // Unique constraint của PostgreSQL là chốt chặn cuối.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        claim = await this.resolveClaimConflict(
          userId,
          dto.campaignId,
          key,
          requestHash,
        );
      } else {
        throw error;
      }
    }

    return this.assessClaim(claim, userId);
  }

  private async assessClaim(
    claim: ClaimView,
    userId: string,
  ): Promise<ClaimView> {
    // Claim đã có assessment (retry sau khi S2 thành công) → không gọi lại.
    if (claim.assessmentId) {
      return claim;
    }

    try {
      const assessment = await this.riskClient.assess({
        claimId: claim.claimId,
        userId,
        campaignId: claim.campaignId,
        evaluationVersion: claim.evaluationVersion,
      });

      // Bước 3b chỉ lưu kết quả; chưa đổi status.
      // Việc áp ALLOW/VERIFY/REJECT nằm ở bước 3c.
      return await this.prisma.trialClaim.update({
        where: { claimId: claim.claimId },
        data: {
          assessmentId: assessment.assessmentId,
          riskScore: assessment.score,
          riskLevel: assessment.level,
          decision: assessment.decision,
          reasonsJson: assessment.reasons,
        },
        select: CLAIM_SELECT,
      });
    } catch (error) {
      // S2 lỗi/timeout: giữ claim PENDING_RISK_CHECK để retry sau.
      this.logger.warn(
        `Không lấy được assessment cho claim ${claim.claimId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      await this.prisma.trialClaim
        .update({
          where: { claimId: claim.claimId },
          data: {
            lastError:
              error instanceof Error ? error.message : 'S2 không phản hồi',
            retryCount: { increment: 1 },
            nextRetryAt: new Date(Date.now() + 30_000),
          },
        })
        .catch(() => undefined);

      return claim;
    }
  }

  private async resolveClaimConflict(
    userId: string,
    campaignId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<ClaimView> {
    const byKey = await this.prisma.trialClaim.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      select: { ...CLAIM_SELECT, requestHash: true },
    });

    if (byKey) {
      if (byKey.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency-Key đã được dùng với payload khác',
        });
      }

      // Cùng key + cùng payload: trả lại claim cũ, không tạo mới.
      const { requestHash: _requestHash, ...claim } = byKey;
      return claim;
    }

    const byCampaign = await this.prisma.trialClaim.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { claimId: true },
    });

    if (byCampaign) {
      throw new ConflictException({
        code: 'TRIAL_ALREADY_CLAIMED',
        message: 'Bạn đã nhận trial cho campaign này',
      });
    }

    throw new ConflictException({
      code: 'CLAIM_CONFLICT',
      message: 'Không thể tạo claim, vui lòng thử lại',
    });
  }
}
