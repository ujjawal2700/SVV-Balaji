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

  @ApiProperty()
  @IsString()
  billingAddress: string;

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

  @ApiPropertyOptional({ description: 'B2B only. Orders that would breach it are refused.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ enum: PaymentTerms, default: PaymentTerms.PREPAID })
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
