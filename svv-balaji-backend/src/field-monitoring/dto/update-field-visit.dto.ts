import { PartialType } from '@nestjs/swagger';
import { CreateFieldVisitDto } from './create-field-visit.dto';

/**
 * A field visit is an expert's observation record. Every field on it is an
 * observation or a piece of advice, and nothing downstream is derived from any
 * of them, so all of it stays correctable - including the farmer, since a visit
 * logged against the wrong neighbour is a common slip.
 */
export class UpdateFieldVisitDto extends PartialType(CreateFieldVisitDto) {}
