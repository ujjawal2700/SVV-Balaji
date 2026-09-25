import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTrainingSessionDto } from './create-training-session.dto';

export class UpdateTrainingSessionDto extends PartialType(OmitType(CreateTrainingSessionDto, ['id'] as const)) {}
