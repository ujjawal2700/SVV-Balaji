import { PartialType } from '@nestjs/swagger';
import { CreateProductionBatchDto } from './production.dto';

export class UpdateProductionBatchDto extends PartialType(CreateProductionBatchDto) {}
