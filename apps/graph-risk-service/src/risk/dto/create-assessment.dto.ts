import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateAssessmentDto {
  @IsString({ message: 'claimId phải là chuỗi' })
  @IsNotEmpty({ message: 'claimId không được để trống' })
  claimId!: string;

  @IsString({ message: 'userId phải là chuỗi' })
  @IsNotEmpty({ message: 'userId không được để trống' })
  userId!: string;

  @IsString({ message: 'campaignId phải là chuỗi' })
  @IsNotEmpty({ message: 'campaignId không được để trống' })
  campaignId!: string;

  @IsInt({ message: 'evaluationVersion phải là số nguyên' })
  @Min(1, { message: 'evaluationVersion phải >= 1' })
  evaluationVersion!: number;
}
