import { RiskService } from './risk.service.js';

const INPUT = {
  claimId: 'claim-1',
  userId: 'user-1',
  campaignId: 'PREMIUM_7_DAYS',
  evaluationVersion: 1,
};

describe('RiskService', () => {
  it('trả assessment ALLOW tối thiểu cho M2', () => {
    const service = new RiskService();
    const result = service.assess(INPUT);

    expect(result).toMatchObject({
      claimId: 'claim-1',
      userId: 'user-1',
      campaignId: 'PREMIUM_7_DAYS',
      evaluationVersion: 1,
      score: 0,
      level: 'LOW',
      decision: 'ALLOW',
      groupScores: { D: 0, N: 0, I: 0, V: 0 },
      reasons: [],
    });
    expect(result.assessmentKey).toBe('claim-1:1');
    expect(result.assessmentId).toHaveLength(64);
  });

  it('cùng claim + version cho cùng assessmentId', () => {
    const service = new RiskService();

    const first = service.assess(INPUT);
    const second = service.assess(INPUT);

    expect(first.assessmentId).toBe(second.assessmentId);
  });

  it('version khác cho assessmentId khác', () => {
    const service = new RiskService();

    const version1 = service.assess(INPUT);
    const version2 = service.assess({ ...INPUT, evaluationVersion: 2 });

    expect(version1.assessmentId).not.toBe(version2.assessmentId);
  });
});
