import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AffiliateCommissionStatus, AffiliateHoldFrom, AffiliatePayoutMethod, AffiliateStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
  MinLength, ValidateIf, ValidateNested,
} from 'class-validator';

// ------------------------------------------------------------------ tracking

export class TrackClickDto {
  @ApiProperty({ example: 'RAUNAK7K2Q' }) @IsString() @MinLength(3) @MaxLength(20) code!: string;
  @ApiPropertyOptional({ example: '/product-detail/abc' }) @IsOptional() @IsString() @MaxLength(300) landingPath?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) referrer?: string;
}

// ------------------------------------------------------------------ affiliate (storefront)

export class PayoutDetailsDto {
  @ApiPropertyOptional({ enum: AffiliatePayoutMethod }) @IsOptional() @IsEnum(AffiliatePayoutMethod) payoutMethod?: AffiliatePayoutMethod;
  @ApiPropertyOptional({ example: 'name@okaxis' })
  @IsOptional() @IsString() @Matches(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, { message: 'Enter a valid UPI id, e.g. name@okaxis' })
  payoutUpiId?: string;
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional() @IsString()
  @MinLength(2, { message: 'Account holder name must be at least 2 characters' })
  @MaxLength(100, { message: 'Account holder name cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z\s]+$/, { message: 'Account holder name must contain only letters and spaces' })
  payoutAccountName?: string;
  @ApiPropertyOptional({ example: '123456789012' })
  @IsOptional() @IsString()
  @Matches(/^\d{9,18}$/, { message: 'Account number must be 9 to 18 digits (numbers only)' })
  payoutAccountNumber?: string;
  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsOptional() @IsString()
  @MinLength(11, { message: 'IFSC must be exactly 11 characters' })
  @MaxLength(11, { message: 'IFSC must be exactly 11 characters' })
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Enter a valid 11-character IFSC code (e.g. HDFC0001234)' })
  payoutIfsc?: string;
  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional() @IsString()
  @MinLength(2, { message: 'Bank name must be at least 2 characters' })
  @MaxLength(100, { message: 'Bank name cannot exceed 100 characters' })
  @Matches(/^[^0-9]+$/, { message: 'Bank name cannot contain numbers' })
  payoutBankName?: string;
}

export class ApplyAffiliateDto extends PayoutDetailsDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(100, { message: 'Full name cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z\s]+$/, { message: 'Full name must contain only letters and spaces' })
  fullName!: string;
  @ApiPropertyOptional({ example: 'priya@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(100, { message: 'Email cannot exceed 100 characters' })
  email?: string;
  @ApiPropertyOptional({ description: 'Website, YouTube / Instagram handle, WhatsApp group...' })
  @IsOptional() @IsString() @MaxLength(300) promotionUrl?: string;
  @ApiPropertyOptional({ example: '10k-50k' }) @IsOptional() @IsString() @MaxLength(60) audienceSize?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) promotionPlan?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: 'Enter a valid PAN, e.g. ABCDE1234F' }) pan?: string;
  @ApiProperty({ description: 'Must be true - the applicant accepted the program terms' }) @IsBoolean() acceptTerms!: boolean;
}

export class UpdateMyAffiliateDto extends PayoutDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsEmail({}, { message: 'Enter a valid email address' }) @MaxLength(100, { message: 'Email cannot exceed 100 characters' }) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) promotionUrl?: string;
}

// ------------------------------------------------------------------ staff

export class ListAffiliatesQueryDto {
  @ApiPropertyOptional({ enum: AffiliateStatus }) @IsOptional() @IsEnum(AffiliateStatus) status?: AffiliateStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) search?: string;
}

export class ReasonDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ListCommissionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() affiliateId?: string;
  @ApiPropertyOptional({ enum: AffiliateCommissionStatus }) @IsOptional() @IsEnum(AffiliateCommissionStatus) status?: AffiliateCommissionStatus;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class ListAttributionsQueryDto {
  @ApiPropertyOptional({ enum: ['ATTRIBUTED', 'FRAUD', 'NO_COMMISSION'] }) @IsOptional() @IsIn(['ATTRIBUTED', 'FRAUD', 'NO_COMMISSION']) status?: 'ATTRIBUTED' | 'FRAUD' | 'NO_COMMISSION';
  @ApiPropertyOptional() @IsOptional() @IsString() affiliateId?: string;
}

export class UpdateAffiliateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ example: 30 }) @IsOptional() @IsInt() @Min(1) @Max(365) cookieDays?: number;
  @ApiPropertyOptional({ example: 7 }) @IsOptional() @IsInt() @Min(0) @Max(90) holdDays?: number;
  @ApiPropertyOptional({ enum: AffiliateHoldFrom }) @IsOptional() @IsEnum(AffiliateHoldFrom) holdFrom?: AffiliateHoldFrom;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(50) defaultRatePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() applyToB2B?: boolean;
  @ApiPropertyOptional({ example: 100 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minPayoutAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) termsText?: string;
}

export class CategoryRateDto {
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty({ nullable: true, example: 5, description: 'null clears the override (the category inherits again)' })
  @ValidateIf((o: CategoryRateDto) => o.ratePercent !== null)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(50)
  ratePercent!: number | null;
}

export class SetCategoryRatesDto {
  @ApiProperty({ type: [CategoryRateDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => CategoryRateDto)
  rates!: CategoryRateDto[];
}

export class CreatePayoutDto {
  @ApiProperty() @IsString() affiliateId!: string;
  @ApiProperty({ description: 'UTR / UPI transaction reference of the transfer you made' }) @IsString() @MinLength(4) @MaxLength(80) reference!: string;
  @ApiProperty({ description: 'The net amount you were shown and transferred - refused if the balance moved since' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) expectedNetAmount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
