import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';

/** Receive a new lot of seed or agri-input into a branch's stock. */
export class ReceiveSeedStockDto {
  @ApiPropertyOptional({ description: 'Defaults to the caller\'s branch. Required for Super Admin.' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 'Certified Wheat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  seedName: string;

  @ApiPropertyOptional({ example: 'HD-2967' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  seedVariety?: string;

  @ApiPropertyOptional({ description: 'Supplier lot / certification number on the packaging.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  batchNumber?: string;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ description: 'Quantity received, in `unit`.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplier?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsDateString()
  receivedAt: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD. An expired lot cannot be issued.' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/** More of the same lot arrived. */
export class TopUpSeedStockDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * A count correction, damage or expiry write-off. `quantity` is signed: -5
 * removes five. The reason is mandatory because an adjustment is the one stock
 * change nobody else can explain later.
 */
export class AdjustSeedStockDto {
  @ApiProperty({ description: 'Signed change, e.g. -5 to write off five units.' })
  @Type(() => Number)
  @IsNumber()
  @NotEquals(0)
  quantity: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

/**
 * Descriptive fields only. Name, variety, batch and unit are fixed once a lot
 * exists, because every handout issued from it copied them.
 */
export class UpdateSeedStockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'false withdraws the lot: it can no longer be issued.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QuerySeedStockDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: '"true" includes withdrawn lots.' })
  @IsOptional()
  @IsString()
  includeInactive?: string;

  @ApiPropertyOptional({ description: '"true" only lots with stock left - what a handout can be issued from.' })
  @IsOptional()
  @IsString()
  availableOnly?: string;
}
