import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosCustomerType, PosPaymentMode, PosSaleStatus, PosShiftStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// --- Outlets ------------------------------------------------------------------------

export class CreatePosOutletDto {
  @ApiProperty({ example: 'Patna City Store' }) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ example: 'OUT-PAT-01', description: 'Unique; letters, digits and dashes' })
  @Matches(/^[A-Za-z0-9-]{2,30}$/, { message: 'Code: 2-30 letters, digits or dashes' })
  code!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) address!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) district?: string | null;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) state!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' }) pincode?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) managerName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) managerPhone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) defaultCashierName?: string | null;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(50) posTerminalsCount?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) defaultOpeningCash?: number;
  @ApiPropertyOptional({ description: 'Super Admin only; everyone else creates in their own branch' })
  @IsOptional() @IsUUID() branchId?: string;
}

export class UpdatePosOutletDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9-]{2,30}$/, { message: 'Code: 2-30 letters, digits or dashes' }) code?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) district?: string | null;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) state?: string;
  @IsOptional() @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' }) pincode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) managerName?: string | null;
  @IsOptional() @IsString() @MaxLength(20) managerPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(120) defaultCashierName?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(50) posTerminalsCount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) defaultOpeningCash?: number;
}

export class SetOutletStatusDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}

export class ListOutletsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional({ description: 'true to include deactivated outlets' }) @IsOptional() @IsString() includeInactive?: string;
}

// --- Shifts -------------------------------------------------------------------------

export class OpenShiftDto {
  @ApiProperty() @IsUUID() outletId!: string;
  @ApiProperty({ example: 5000, description: 'Cash in the drawer at the start of the shift' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) openingCash!: number;
}

export class CloseShiftDto {
  @ApiProperty({ example: 17450, description: 'Physical cash counted in the drawer' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) countedCash!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListShiftsQueryDto {
  @IsOptional() @IsUUID() outletId?: string;
  @IsOptional() @IsEnum(PosShiftStatus) status?: PosShiftStatus;
  @ApiPropertyOptional({ example: '2026-09-29' }) @IsOptional() @Matches(DAY) from?: string;
  @ApiPropertyOptional({ example: '2026-09-29' }) @IsOptional() @Matches(DAY) to?: string;
}

// --- Sales --------------------------------------------------------------------------

export class PosSaleItemDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @Min(1) @Max(10_000) quantity!: number;
}

export class PosCustomerDto {
  @ApiPropertyOptional({ enum: PosCustomerType, default: PosCustomerType.WALK_IN })
  @IsOptional() @IsEnum(PosCustomerType) type?: PosCustomerType;
  @ApiPropertyOptional({ default: 'Walk-in customer' }) @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @Matches(/^[0-9+\- ]{10,15}$/, { message: 'Mobile number looks wrong' }) phone?: string;
  @ApiPropertyOptional({ description: 'Validated (check digit) - a wrong GSTIN costs the buyer their input credit' })
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePosSaleDto {
  @ApiProperty() @IsUUID() outletId!: string;

  @ApiProperty({ type: [PosSaleItemDto] })
  @ValidateNested({ each: true }) @Type(() => PosSaleItemDto) @ArrayMinSize(1) @ArrayMaxSize(200)
  items!: PosSaleItemDto[];

  @ApiPropertyOptional({ description: 'Counter discount in rupees, spread over the lines before GST' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount?: number;

  @ApiProperty({ enum: PosPaymentMode }) @IsEnum(PosPaymentMode) paymentMode!: PosPaymentMode;
  @ApiPropertyOptional({ description: 'CASH only: what the customer handed over' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amountTendered?: number;
  @ApiPropertyOptional({ description: 'UPI transaction id or card slip number' })
  @IsOptional() @IsString() @MaxLength(80) paymentReference?: string;

  @ApiPropertyOptional({ type: PosCustomerDto })
  @IsOptional() @ValidateNested() @Type(() => PosCustomerDto) customer?: PosCustomerDto;

  @ApiPropertyOptional({ description: 'Generated by the terminal per bill; a retry with the same id returns the same sale' })
  @IsOptional() @IsString() @MaxLength(64) clientRequestId?: string;
}

export class RefundPosSaleDto {
  @ApiProperty({ description: 'Why the whole bill is being refunded' }) @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class ListSalesQueryDto {
  @IsOptional() @IsUUID() outletId?: string;
  @IsOptional() @IsEnum(PosPaymentMode) paymentMode?: PosPaymentMode;
  @IsOptional() @IsEnum(PosSaleStatus) status?: PosSaleStatus;
  @IsOptional() @IsUUID() shiftId?: string;
  @ApiPropertyOptional({ description: 'Sale number, customer name or phone' }) @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ example: '2026-09-29' }) @IsOptional() @Matches(DAY) from?: string;
  @ApiPropertyOptional({ example: '2026-09-29' }) @IsOptional() @Matches(DAY) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ReportQueryDto {
  @IsOptional() @IsUUID() outletId?: string;
  @ApiPropertyOptional({ example: '2026-09-01' }) @IsOptional() @Matches(DAY) from?: string;
  @ApiPropertyOptional({ example: '2026-09-29' }) @IsOptional() @Matches(DAY) to?: string;
}
