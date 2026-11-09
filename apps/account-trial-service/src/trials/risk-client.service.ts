import { Injectable } from '@nestjs/common';

export interface RiskAssessmentInput {
  claimId: string;
  userId: string;
  campaignId: string;
  evaluationVersion: number;
}

export interface RiskAssessmentResponse {
  assessmentId: string;
  assessmentKey: string;
  claimId: string;
  userId: string;
  campaignId: string;
  evaluationVersion: number;
  score: number;
  level: string;
  decision: string;
  groupScores: Record<string, number>;
  reasons: string[];
  ruleVersion: string;
  evaluatedAt: string;
}

@Injectable()
export class RiskClient {
  async assess(
    input: RiskAssessmentInput,
  ): Promise<RiskAssessmentResponse> {
    const baseUrl =
      process.env.RISK_SERVICE_URL ?? 'http://graph-risk:3002';
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    const timeoutMs = Number(process.env.RISK_HTTP_TIMEOUT_MS ?? 2000);

    if (!token) {
      throw new Error('INTERNAL_SERVICE_TOKEN chưa được cấu hình');
    }

    const response = await fetch(`${baseUrl}/internal/risk/assessments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`S2 trả HTTP ${response.status}`);
    }

    return (await response.json()) as RiskAssessmentResponse;
  }
}
