import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductionType } from '@prisma/client';

export class RecipeIngredientDto {
  @ApiProperty({ description: 'Must match the cropName on raw material batches' })
  @IsString()
  cropName: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Share of the blend, 0-100. Required for MULTI_GRAIN.' })
  @IsOptional()
  @IsNumber()
  percentage?: number;
}

export class CreateRecipeDto {
  @ApiProperty()
  @IsString()
  recipeCode: string;

  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProductionType })
  @IsEnum(ProductionType)
  productionType: ProductionType;

  @ApiProperty({ type: [RecipeIngredientDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients: RecipeIngredientDto[];

  // FRD 19.3 production formula
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mixingRatio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  processingSequence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grindingInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roastingInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oilExtractionProcess?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packagingInstructions?: string;

  @ApiPropertyOptional({ description: 'Expected output for one full batch' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  batchYieldQuantity?: number;

  @ApiPropertyOptional({ default: 'KG' })
  @IsOptional()
  @IsString()
  unit?: string;
}
