import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClaimDto {
  @IsString({ message: 'campaignId phải là chuỗi' })
  @IsNotEmpty({ message: 'campaignId không được để trống' })
  @MaxLength(64, { message: 'campaignId quá dài' })
  campaignId!: string;
}
