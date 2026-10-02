import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExchangeLowerPriceAction, QcDecision, RefundMethod, ReturnLogistics, ReturnRequestStatus, ReturnRequestType, ReturnShippingPayer, SalesChannel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';

// ------------------------------------------------------------------ requests

/** Optional payout details given with a request (or by staff when refunding). */
export class RefundDetailsDto {
  @ApiPropertyOptional({ enum: RefundMethod }) @IsOptional() @IsEnum(RefundMethod) refundMethod?: RefundMethod;
  @ApiPropertyOptional({ example: 'name@okbank' })
  @IsOptional() @Matches(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, { message: 'Enter a valid UPI id (like name@bank)' })
  upiId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) accountName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{9,18}$/, { message: 'Enter a valid bank account number' }) accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Enter a valid IFSC (like SBIN0001234)' }) ifsc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bankName?: string;
}

export class CreateReturnRequestDto extends RefundDetailsDto {
  @ApiProperty() @IsString() orderNumber!: string;
  @ApiProperty() @IsString() orderItemId!: string;
  @ApiProperty({ enum: ReturnRequestType }) @IsEnum(ReturnRequestType) type!: ReturnRequestType;
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(100000) quantity!: number;
  @ApiProperty() @IsString() reasonId!: string;
  @ApiPropertyOptional({ maxLength: 1000 }) @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional({ type: [String], description: 'URLs from POST /storefront/returns/media' })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUrl({ require_tld: false }, { each: true }) mediaUrls?: string[];
  @ApiPropertyOptional({ description: 'EXCHANGE only. Defaults to the same product.' })
  @IsOptional() @IsString() replacementProductId?: string;
}

/** Staff raising a request on a customer's behalf (e.g. a phone call). */
export class StaffCreateReturnRequestDto extends CreateReturnRequestDto {
  @ApiPropertyOptional({ description: 'Raise it even though the return/exchange window has closed. Note required.' })
  @IsOptional() @IsBoolean() overrideWindow?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PayDifferenceDto {
  @ApiPropertyOptional({ description: 'Use the Refund Wallet first; the rest is paid online.' })
  @IsOptional() @IsBoolean() useWallet?: boolean;
}

export class ConfirmDifferenceDto {
  @ApiProperty() @IsString() @MaxLength(80) gatewayPaymentId!: string;
  @ApiProperty() @IsString() @MaxLength(200) signature!: string;
}

// ------------------------------------------------------------------ staff actions

export class NoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReasonDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ApproveDto extends NoteDto {
  @ApiPropertyOptional({ enum: ReturnLogistics, description: 'Override how the item is collected (staff-placed orders).' })
  @IsOptional() @IsEnum(ReturnLogistics) logistics?: ReturnLogistics;
  @ApiPropertyOptional({ description: 'Schedule the pickup straight away (default true).' })
  @IsOptional() @IsBoolean() schedulePickup?: boolean;
}

export class QcDto {
  @ApiProperty({ enum: QcDecision }) @IsEnum(QcDecision) decision!: QcDecision;
  @ApiProperty({ description: 'Packs fit to sell again' }) @Type(() => Number) @IsInt() @Min(0) goodQuantity!: number;
  @ApiProperty({ description: 'Packs damaged / unsellable' }) @Type(() => Number) @IsInt() @Min(0) damagedQuantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CompleteRefundDto extends RefundDetailsDto {
  @ApiPropertyOptional({ description: 'Bank UTR / UPI transaction id. Required for UPI and BANK.' })
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RecordDifferenceDto {
  @ApiProperty({ description: 'UPI / cash / bank reference for money collected outside the app' })
  @IsString() @MinLength(3) @MaxLength(120) reference!: string;
}

export class ListReturnsQueryDto {
  @ApiPropertyOptional({ enum: ReturnRequestStatus }) @IsOptional() @IsEnum(ReturnRequestStatus) status?: ReturnRequestStatus;
  @ApiPropertyOptional({ enum: ReturnRequestType }) @IsOptional() @IsEnum(ReturnRequestType) type?: ReturnRequestType;
  @ApiPropertyOptional({ enum: ReturnLogistics }) @IsOptional() @IsEnum(ReturnLogistics) logistics?: ReturnLogistics;
  @ApiPropertyOptional({ description: 'Request, order number, customer name or phone' }) @IsOptional() @IsString() @MaxLength(80) search?: string;
  @ApiPropertyOptional({ enum: ['open', 'closed', 'all'] }) @IsOptional() @IsIn(['open', 'closed', 'all']) view?: 'open' | 'closed' | 'all';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

// ------------------------------------------------------------------ settings

export class UpdateReturnSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() returnEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exchangeEnabled?: boolean;
  @ApiPropertyOptional({ description: 'Hours after actual delivery' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24 * 365) returnWindowHours?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24 * 365) exchangeWindowHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mediaRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10) minMediaCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) maxMediaCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() qcRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoApprove?: boolean;
  @ApiPropertyOptional({ enum: RefundMethod, isArray: true }) @IsOptional() @IsArray() @IsEnum(RefundMethod, { each: true }) allowedRefundMethods?: RefundMethod[];
  @ApiPropertyOptional({ enum: RefundMethod }) @IsOptional() @IsEnum(RefundMethod) defaultRefundMethod?: RefundMethod;
  @ApiPropertyOptional({ enum: ReturnShippingPayer }) @IsOptional() @IsEnum(ReturnShippingPayer) returnShippingPayer?: ReturnShippingPayer;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) returnShippingFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) restockingFeePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exchangeSameProductOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() exchangeSameCategoryOnly?: boolean;
  @ApiPropertyOptional({ enum: ExchangeLowerPriceAction }) @IsOptional() @IsEnum(ExchangeLowerPriceAction) exchangeLowerPriceAction?: ExchangeLowerPriceAction;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() restockOnQcPass?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) nonReturnableCategoryIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) nonReturnableProductIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) nonExchangeableCategoryIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) nonExchangeableProductIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) policyText?: string;
}

export class ReturnReasonDto {
  @ApiProperty({ example: 'DAMAGED' }) @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'Code: capitals, digits and underscores' }) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) label!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forReturn?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forExchange?: boolean;
  @ApiPropertyOptional({ enum: SalesChannel, nullable: true, description: 'Null = both channels' })
  @IsOptional() @IsEnum(SalesChannel) channel?: SalesChannel | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() companyFault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresMedia?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateReturnReasonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) label?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forReturn?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forExchange?: boolean;
  @ApiPropertyOptional({ enum: SalesChannel, nullable: true }) @IsOptional() @IsEnum(SalesChannel) channel?: SalesChannel | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() companyFault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresMedia?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

// ------------------------------------------------------------------ rider

export class RiderOtpDto {
  @ApiProperty({ description: 'The code the customer reads out' }) @Matches(/^\d{4,6}$/) otp!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
}

export class RiderLocDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}

export class RiderFailDto extends RiderLocDto {
  @ApiProperty() @IsString() @MaxLength(40) reasonCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}
