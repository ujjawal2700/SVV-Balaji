import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * What can be corrected on a collection, and why the rest cannot.
 *
 * Deliberately written out rather than derived from CreateCollectionDto,
 * because the difference between the two is the point of this file.
 *
 * Not editable:
 *
 *   inspectionId    - the collection IS the collection of that inspection, and
 *                     the relation is unique. Pointing it at a different
 *                     harvest would leave the original inspection looking
 *                     uncollected while its batch still traces back through it.
 *   warehouseId     - stock moves through stock-in, transfer and adjust, which
 *                     write the movement ledger. Changing it here would
 *                     relocate stock with no ledger entry, which is precisely
 *                     the drift the ledger exists to prevent.
 *   collectionDate  - the receipt and batch numbers encode this date. They are
 *                     printed on the farmer's receipt and carried down the
 *                     whole chain, so changing the date would make them wrong
 *                     rather than regenerate them.
 *
 * Weights and rate ARE editable, under the guard in `update()`. A weighbridge
 * figure entered as 500 instead of 50 is the most common correction in this
 * system, and refusing it would mean cancelling and re-collecting the harvest.
 */
export class UpdateCollectionDto {
  @ApiPropertyOptional({ description: 'Gross weight including packaging' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @ApiPropertyOptional({ description: 'Net weight - must not exceed gross' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  netWeight?: number;

  @ApiPropertyOptional({ description: 'Rate per unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  collectionLocation?: string;

  @ApiPropertyOptional({
    description:
      'Why the figures were corrected. Written onto the stock ledger when the net weight ' +
      'changes, so the adjustment is explainable months later.',
  })
  @IsOptional()
  @IsString()
  correctionReason?: string;
}
