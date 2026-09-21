import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StorefrontTraceService } from './storefront-trace.service';

/**
 * Deliberately unguarded: the QR on a pack is scanned by a shopper with no
 * account. Returns a public projection only - see StorefrontTraceService.
 */
@ApiTags('storefront-trace')
@Controller('storefront/trace')
export class StorefrontTraceController {
  constructor(private readonly service: StorefrontTraceService) {}

  @Get(':fgBatchNumber')
  @ApiOperation({
    summary: 'Public pack history for a QR scan',
    description:
      'Region-level origin, lab quality and milling dates for a QA-released finished goods batch. ' +
      'Never returns farmer identity, contact, bank or pricing data. Unknown or unreleased batches 404.',
  })
  trace(@Param('fgBatchNumber') fgBatchNumber: string) {
    return this.service.trace(fgBatchNumber);
  }
}
