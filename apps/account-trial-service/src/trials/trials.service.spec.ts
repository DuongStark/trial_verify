import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RiskClient } from './risk-client.service.js';
import { TrialsService } from './trials.service.js';

const CAMPAIGN_ID = 'PREMIUM_7_DAYS';

const CLAIM = {
  claimId: 'claim-1',
  campaignId: CAMPAIGN_ID,
  status: 'PENDING_RISK_CHECK',
  evaluationVersion: 1,
  assessmentId: null,
  riskScore: null,
  riskLevel: null,
  decision: null,
  requestedAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
};

const ASSESSMENT = {
  assessmentId: 'assessment-1',
  assessmentKey: 'claim-1:1',
  claimId: 'claim-1',
  userId: 'user-1',
  campaignId: CAMPAIGN_ID,
  evaluationVersion: 1,
  score: 0,
  level: 'LOW',
  decision: 'ALLOW',
  groupScores: { D: 0, N: 0, I: 0, V: 0 },
  reasons: [],
  ruleVersion: 'stub-v1',
  evaluatedAt: '2026-01-01T00:00:01.000Z',
};

const ASSESSED_CLAIM = {
  ...CLAIM,
  assessmentId: ASSESSMENT.assessmentId,
  riskScore: ASSESSMENT.score,
  riskLevel: ASSESSMENT.level,
  decision: ASSESSMENT.decision,
};

function expectedRequestHash(campaignId: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ campaignId }))
    .digest('hex');
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

function createPrismaMock() {
  const tx = {
    trialClaim: { create: vi.fn() },
    outboxEvent: { create: vi.fn() },
  };

  return {
    trialCampaign: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    trialClaim: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
}

function createRiskMock() {
  return { assess: vi.fn() };
}

function createService(
  prisma: ReturnType<typeof createPrismaMock>,
  risk: ReturnType<typeof createRiskMock>,
): TrialsService {
  return new TrialsService(
    prisma as unknown as PrismaService,
    risk as unknown as RiskClient,
  );
}

describe('TrialsService', () => {
  describe('listActiveCampaigns', () => {
    it('chỉ lấy campaign active và sắp xếp theo campaignId', async () => {
      const prisma = createPrismaMock();
      const campaigns = [
        {
          campaignId: CAMPAIGN_ID,
          name: 'Premium 7 Days Trial',
          durationDays: 7,
          active: true,
        },
      ];
      prisma.trialCampaign.findMany.mockResolvedValue(campaigns);

      const result = await createService(prisma, createRiskMock())
        .listActiveCampaigns();

      expect(prisma.trialCampaign.findMany).toHaveBeenCalledWith({
        where: { active: true },
        select: {
          campaignId: true,
          name: true,
          durationDays: true,
          active: true,
        },
        orderBy: { campaignId: 'asc' },
      });
      expect(result).toEqual(campaigns);
    });

    it('trả mảng rỗng khi không có campaign active', async () => {
      const prisma = createPrismaMock();
      prisma.trialCampaign.findMany.mockResolvedValue([]);

      await expect(
        createService(prisma, createRiskMock()).listActiveCampaigns(),
      ).resolves.toEqual([]);
    });
  });

  describe('createClaim', () => {
    it('tạo claim + outbox rồi lưu assessment từ S2', async () => {
      const prisma = createPrismaMock();
      const risk = createRiskMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: true });
      prisma.trialClaim.update.mockResolvedValue(ASSESSED_CLAIM);
      risk.assess.mockResolvedValue(ASSESSMENT);

      const tx = {
        trialClaim: { create: vi.fn().mockResolvedValue(CLAIM) },
        outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      );

      const service = createService(prisma, risk);
      const result = await service.createClaim(
        'user-1',
        { campaignId: CAMPAIGN_ID },
        'key-1',
      );

      expect(result).toEqual(ASSESSED_CLAIM);
      expect(tx.trialClaim.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          campaignId: CAMPAIGN_ID,
          idempotencyKey: 'key-1',
          requestHash: expectedRequestHash(CAMPAIGN_ID),
        },
        select: expect.any(Object),
      });
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateId: CLAIM.claimId,
          aggregateVersion: 1,
          eventType: 'trial.claim_audit.v1',
        }),
      });
      expect(risk.assess).toHaveBeenCalledWith({
        claimId: CLAIM.claimId,
        userId: 'user-1',
        campaignId: CAMPAIGN_ID,
        evaluationVersion: 1,
      });
      expect(prisma.trialClaim.update).toHaveBeenCalledWith({
        where: { claimId: CLAIM.claimId },
        data: {
          assessmentId: ASSESSMENT.assessmentId,
          riskScore: ASSESSMENT.score,
          riskLevel: ASSESSMENT.level,
          decision: ASSESSMENT.decision,
          reasonsJson: ASSESSMENT.reasons,
        },
        select: expect.any(Object),
      });
    });

    it('giữ PENDING và ghi lastError khi S2 lỗi', async () => {
      const prisma = createPrismaMock();
      const risk = createRiskMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: true });
      prisma.trialClaim.update.mockResolvedValue(CLAIM);
      risk.assess.mockRejectedValue(new Error('S2 trả HTTP 503'));

      const tx = {
        trialClaim: { create: vi.fn().mockResolvedValue(CLAIM) },
        outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      );

      const result = await createService(prisma, risk).createClaim(
        'user-1',
        { campaignId: CAMPAIGN_ID },
        'key-1',
      );

      expect(result).toEqual(CLAIM);
      expect(prisma.trialClaim.update).toHaveBeenCalledWith({
        where: { claimId: CLAIM.claimId },
        data: expect.objectContaining({
          lastError: 'S2 trả HTTP 503',
          retryCount: { increment: 1 },
        }),
      });
    });

    it('từ chối khi thiếu Idempotency-Key', async () => {
      const prisma = createPrismaMock();

      await expect(
        createService(prisma, createRiskMock()).createClaim(
          'user-1',
          { campaignId: CAMPAIGN_ID },
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trialCampaign.findUnique).not.toHaveBeenCalled();
    });

    it('trả 422 khi campaign không tồn tại hoặc đã tắt', async () => {
      const prisma = createPrismaMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: false });

      await expect(
        createService(prisma, createRiskMock()).createClaim(
          'user-1',
          { campaignId: CAMPAIGN_ID },
          'key-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cùng key + cùng payload + đã có assessment: trả claim cũ, không gọi S2', async () => {
      const prisma = createPrismaMock();
      const risk = createRiskMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: true });
      prisma.$transaction.mockRejectedValue(uniqueConstraintError());
      prisma.trialClaim.findUnique.mockResolvedValue({
        ...ASSESSED_CLAIM,
        requestHash: expectedRequestHash(CAMPAIGN_ID),
      });

      const result = await createService(prisma, risk).createClaim(
        'user-1',
        { campaignId: CAMPAIGN_ID },
        'key-1',
      );

      expect(result).toEqual(ASSESSED_CLAIM);
      expect(result).not.toHaveProperty('requestHash');
      expect(risk.assess).not.toHaveBeenCalled();
    });

    it('cùng key + cùng payload nhưng chưa có assessment: gọi S2 lại', async () => {
      const prisma = createPrismaMock();
      const risk = createRiskMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: true });
      prisma.$transaction.mockRejectedValue(uniqueConstraintError());
      prisma.trialClaim.findUnique.mockResolvedValue({
        ...CLAIM,
        requestHash: expectedRequestHash(CAMPAIGN_ID),
      });
      risk.assess.mockResolvedValue(ASSESSMENT);
      prisma.trialClaim.update.mockResolvedValue(ASSESSED_CLAIM);

      const result = await createService(prisma, risk).createClaim(
        'user-1',
        { campaignId: CAMPAIGN_ID },
        'key-1',
      );

      expect(result).toEqual(ASSESSED_CLAIM);
      expect(risk.assess).toHaveBeenCalledOnce();
    });

    it('trả 409 IDEMPOTENCY_KEY_REUSED khi cùng key nhưng khác payload', async () => {
      const prisma = createPrismaMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: true });
      prisma.$transaction.mockRejectedValue(uniqueConstraintError());
      prisma.trialClaim.findUnique.mockResolvedValue({
        ...CLAIM,
        requestHash: 'hash-cua-payload-khac',
      });

      await expect(
        createService(prisma, createRiskMock()).createClaim(
          'user-1',
          { campaignId: CAMPAIGN_ID },
          'key-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'IDEMPOTENCY_KEY_REUSED' },
      });
    });

    it('trả 409 TRIAL_ALREADY_CLAIMED khi campaign đã được claim bằng key khác', async () => {
      const prisma = createPrismaMock();
      prisma.trialCampaign.findUnique.mockResolvedValue({ active: true });
      prisma.$transaction.mockRejectedValue(uniqueConstraintError());
      prisma.trialClaim.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ claimId: CLAIM.claimId });

      await expect(
        createService(prisma, createRiskMock()).createClaim(
          'user-1',
          { campaignId: CAMPAIGN_ID },
          'key-moi',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
