import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SalesChannel } from '@prisma/client';
import { OTP_LENGTH } from '../otp.config';

export const AUTH_AUDIENCES = ['CUSTOMER', 'RETAILER'] as const;
export type AuthAudience = (typeof AUTH_AUDIENCES)[number];

export class ApplyReferralCodeDto {
  @ApiProperty({ example: 'RAUNAK4821' })
  @IsString()
  @MaxLength(20)
  code!: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: '9111966732', description: 'Indian mobile number, any common format' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional({
    enum: AUTH_AUDIENCES,
    description:
      'Which sign-in screen this is. A number that belongs to the other audience is refused up ' +
      'front (a retailer number cannot sign in as a customer and vice versa).',
  })
  @IsOptional()
  @IsIn(AUTH_AUDIENCES)
  audience?: AuthAudience;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9111966732' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({
    enum: AUTH_AUDIENCES,
    description:
      'CUSTOMER: sign-in only - an unknown number is created as a customer on this first ' +
      'verification, a known one just signs in. RETAILER: login only - never creates an account ' +
      '(retailers register first).',
  })
  @IsIn(AUTH_AUDIENCES)
  audience!: AuthAudience;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(OTP_LENGTH, OTP_LENGTH)
  @Matches(/^\d+$/, { message: 'The code is digits only' })
  code!: string;

  @ApiPropertyOptional({
    description:
      'Supplied on a consumer\'s first sign-in. Omitted, the account is created against a ' +
      'placeholder name the customer can change in their profile.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'RAUNAK4821',
    description:
      'Another customer\'s referral code. Only meaningful on a brand-new consumer\'s first ' +
      'verify - ignored on an existing account, which already has whatever referral ' +
      'relationship it is ever going to have.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;
}

/**
 * A retailer signing themselves up. This creates a login in PENDING_APPROVAL,
 * not a Customer - nobody trades on credit terms because they filled in a form.
 * Staff approve it, and approval is what creates the commercial record.
 */
export class RegisterRetailerDto {
  @ApiProperty({ example: '9111966732' })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ example: 'Ramesh Kumar', description: 'Person who will sign in' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'Sri Balaji Provision Store' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  businessName!: string;

  @ApiPropertyOptional({ example: 'ramesh@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '29ABCDE1234F1Z5', description: '15-character GSTIN' })
  @IsOptional()
  @IsString()
  @Length(15, 15)
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, { message: 'Invalid GSTIN format' })
  gstin?: string;

  @ApiPropertyOptional({ example: 'UDYAM-MH-18-0000001' })
  @IsOptional()
  @IsString()
  @Matches(/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/, { message: 'Invalid Udyam Registration Number format' })
  udyamRegistration?: string;

  @ApiPropertyOptional({ example: 'ABCDE1234F' })
  @ValidateIf((o) => !o.aadhaar)
  @IsNotEmpty({ message: 'Either PAN or Aadhaar is required' })
  @IsString()
  @Length(10, 10)
  pan?: string;

  @ApiPropertyOptional({ example: '123456789012' })
  @ValidateIf((o) => !o.pan)
  @IsNotEmpty({ message: 'Either PAN or Aadhaar is required' })
  @IsString()
  @Length(12, 12)
  @Matches(/^\d{12}$/, { message: 'Aadhaar must be 12 digits' })
  aadhaar?: string;

  @ApiProperty({ example: '12 Market Road' })
  @IsString()
  @MinLength(4)
  @MaxLength(250)
  addressLine!: string;

  @ApiProperty({ example: 'Bengaluru' })
  @IsString()
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional({ example: 'Bengaluru Urban' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiProperty({ example: 'Karnataka' })
  @IsString()
  @MaxLength(120)
  state!: string;

  @ApiProperty({ example: '560001' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'A pincode is 6 digits' })
  pincode!: string;

  @ApiPropertyOptional({
    example: 'RAUNAK4821',
    description:
      'Another customer\'s referral code. Validated immediately (so a typo is caught before ' +
      'submission goes to review), and re-checked when staff approve the registration - the ' +
      'point the relationship is actually created.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;
}

export class StorefrontRefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class UpdateStorefrontProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Staff-side filter when reviewing the retailer signup queue. */
export class ListAccountsQueryDto {
  @ApiPropertyOptional({ enum: SalesChannel })
  @IsOptional()
  @IsEnum(SalesChannel)
  channel?: SalesChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class RejectAccountDto {
  @ApiProperty({ example: 'GSTIN could not be verified' })
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

export class StorefrontLogoutDto {
  @ApiPropertyOptional({ description: "The session's refresh token. Optional if the access token is sent as Bearer." })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
