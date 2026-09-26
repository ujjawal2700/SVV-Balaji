import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CheckoutItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Max(100000) quantity!: number;
}

/**
 * Deliberately has NO price, tax, fee, discount amount or delivery-method
 * field: the server works all of those out. `expectedTotal` is the one number
 * the client may send, and it is only compared - never used.
 */
export class CheckoutDto {
  @ApiProperty() @IsString() addressId!: string;

  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) couponCode?: string;
  @ApiPropertyOptional({
    description:
      'Loyalty points to spend. In wallet COMBINED mode this is the total wallet coins to spend ' +
      '(the server decides the loyalty/referral split); redeemReferralPoints must be omitted or 0 then.',
  })
  @IsOptional() @IsInt() @Min(0) redeemPoints?: number;
  @ApiPropertyOptional({
    description: 'Referral coins to spend. Only meaningful in wallet SEPARATE mode - see redeemPoints.',
  })
  @IsOptional() @IsInt() @Min(0) redeemReferralPoints?: number;
  @ApiPropertyOptional({ enum: PaymentMode }) @IsOptional() @IsEnum(PaymentMode) paymentMode?: PaymentMode;
  @ApiPropertyOptional({
    enum: ['STANDARD', 'QUICK'],
    description: 'QUICK only when the quote offered it as available; otherwise 409 QUICK_UNAVAILABLE. Default STANDARD.',
  })
  @IsOptional() @IsIn(['STANDARD', 'QUICK']) deliverySpeed?: 'STANDARD' | 'QUICK';
  @ApiPropertyOptional({ description: 'The total the customer was shown; used only to detect a price change' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) expectedTotal?: number;
}

export class ConfirmCheckoutDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) gatewayPaymentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) signature?: string;
}
