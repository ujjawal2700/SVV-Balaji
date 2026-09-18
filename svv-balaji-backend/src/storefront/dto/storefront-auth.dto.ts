import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SalesChannel } from '@prisma/client';
import { OTP_LENGTH } from '../otp.config';

export class RequestOtpDto {
  @ApiProperty({ example: '9111966732', description: 'Indian mobile number, any common format' })
  @IsString()
  @MaxLength(20)
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '9111966732' })
  @IsString()
  @MaxLength(20)
  phone!: string;

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

  @ApiProperty({ example: '29ABCDE1234F1Z5', description: '15-character GSTIN' })
  @IsString()
  @Length(15, 15)
  gstin!: string;

  @ApiPropertyOptional({ example: 'ABCDE1234F' })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  pan?: string;

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
