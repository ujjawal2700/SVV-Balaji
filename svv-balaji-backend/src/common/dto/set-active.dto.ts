import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * The soft-delete switch shared by every master that carries `isActive`
 * (branch, product, warehouse, price list).
 *
 * Deliberately a boolean the caller sets rather than a toggle: a toggle
 * endpoint gives a different result depending on how many times it is called,
 * which is exactly the wrong property for a button that can be double-clicked.
 */
export class SetActiveDto {
  @ApiProperty({ description: 'false hides it from every dropdown; true brings it back' })
  @IsBoolean()
  isActive: boolean;
}
