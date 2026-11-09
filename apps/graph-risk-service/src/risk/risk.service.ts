import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CreateAssessmentDto } from './dto/create-assessment.dto.js';

export interface AssessmentResult {
  assessmentId: string;
  assessmentKey: string;
  claimId: string;
  userId: string;
  campaignId: string;
  evaluationVersion: number;
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  decision: 'ALLOW' | 'VERIFY' | 'REJECT';
  groupScores: { D: number; N: number; I: number; V: number };
  reasons: string[];
  ruleVersion: string;
  evaluatedAt: string;
}

@Injectable()
export class RiskService {
  // Bản tối thiểu cho M2: chưa dùng Neo4j hay tín hiệu D/N/I/V.
  // Luôn ALLOW để nối được luồng S1 → S2. M3 sẽ thay bằng chấm điểm thật.
  assess(dto: CreateAssessmentDto): AssessmentResult {
    const assessmentKey = `${dto.claimId}:${dto.evaluationVersion}`;

    // Cùng claim + cùng version luôn cho cùng assessmentId,
    // nhờ vậy S2 idempotent mà chưa cần lưu trữ.
    const assessmentId = createHash('sha256')
      .update(assessmentKey)
      .digest('hex');

    return {
      assessmentId,
      assessmentKey,
      claimId: dto.claimId,
      userId: dto.userId,
      campaignId: dto.campaignId,
      evaluationVersion: dto.evaluationVersion,
      score: 0,
      level: 'LOW',
      decision: 'ALLOW',
      groupScores: { D: 0, N: 0, I: 0, V: 0 },
      reasons: [],
      ruleVersion: 'stub-v1',
      evaluatedAt: new Date().toISOString(),
    };
  }
}
