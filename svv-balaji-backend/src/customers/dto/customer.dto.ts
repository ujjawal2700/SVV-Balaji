import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CustomerStatus,
  CustomerType,
  PaymentTerms,
  SalesChannel,
} from '@prisma/client';

export class CreateCustomerDto {
  @ApiProperty({
    enum: SalesChannel,
    description:
      'B2B for distributors, retailers and institutions; B2C for consumers buying directly. ' +
      'Determines which price list applies and which rules are enforced.',
  })
  @IsEnum(SalesChannel)
  channel: SalesChannel;

  @ApiProperty({ enum: CustomerType })
  @IsEnum(CustomerType)
  type: CustomerType;

  @ApiProperty()
  @IsString()
  @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty()
  @IsString()
  @Length(7, 20)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Required for B2B customers - it goes on the tax invoice. Rejected for B2C.',
  })
  @IsOptional()
  @IsString()
  gstin?: string;

  @ApiPropertyOptional({
    description: 'Required for B2B (goes on the tax invoice). Optional for a quick B2C registration - defaults to blank, filled in later.',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({ description: 'Defaults to the billing address when omitted' })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Credit is not offered (10 Oct 2026). Any value above 0 is refused.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ enum: PaymentTerms, default: PaymentTerms.PREPAID, deprecated: true, description: 'Only PREPAID is accepted - credit is not offered (10 Oct 2026).' })
  @IsOptional()
  @IsEnum(PaymentTerms)
  paymentTerms?: PaymentTerms;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Sales executive who owns the relationship. B2B only.' })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: CustomerStatus, default: CustomerStatus.ACTIVE, description: 'Create only. Defaults to ACTIVE.' })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({
    description: 'Create only. Another customer\'s referral code, if this registration was referred - creates the Referral relationship.',
  })
  @IsOptional()
  @IsString()
  referredByCode?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: CustomerStatus })
  @IsEnum(CustomerStatus)
  status: CustomerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
