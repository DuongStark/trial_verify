import { RiskClient, RiskAssessmentResponse } from './risk-client.service.js';

const ASSESSMENT: RiskAssessmentResponse = {
  assessmentId: 'assessment-1',
  assessmentKey: 'claim-1:1',
  claimId: 'claim-1',
  userId: 'user-1',
  campaignId: 'PREMIUM_7_DAYS',
  evaluationVersion: 1,
  score: 0,
  level: 'LOW',
  decision: 'ALLOW',
  groupScores: { D: 0, N: 0, I: 0, V: 0 },
  reasons: [],
  ruleVersion: 'stub-v1',
  evaluatedAt: '2026-01-01T00:00:01.000Z',
};

const INPUT = {
  claimId: 'claim-1',
  userId: 'user-1',
  campaignId: 'PREMIUM_7_DAYS',
  evaluationVersion: 1,
};

describe('RiskClient', () => {
  const originalToken = process.env.INTERNAL_SERVICE_TOKEN;
  const originalUrl = process.env.RISK_SERVICE_URL;

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
    process.env.RISK_SERVICE_URL = 'http://risk-test:3002';
  });

  afterEach(() => {
    process.env.INTERNAL_SERVICE_TOKEN = originalToken;
    process.env.RISK_SERVICE_URL = originalUrl;
    vi.unstubAllGlobals();
  });

  it('gửi đúng URL, token và body tới S2', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ASSESSMENT,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new RiskClient().assess(INPUT);

    expect(result).toEqual(ASSESSMENT);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://risk-test:3002/internal/risk/assessments',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': 'internal-secret',
        },
        body: JSON.stringify(INPUT),
      }),
    );
  });

  it('ném lỗi khi S2 trả status không phải 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(new RiskClient().assess(INPUT)).rejects.toThrow('HTTP 503');
  });

  it('ném lỗi khi thiếu internal token', async () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;

    await expect(new RiskClient().assess(INPUT)).rejects.toThrow(
      'INTERNAL_SERVICE_TOKEN',
    );
  });
});
