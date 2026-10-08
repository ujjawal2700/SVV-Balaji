import { Body, Controller, Get, Header, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CancelCreditNoteDto, CreditNotesService, IssueCreditNoteDto, ListCreditNotesQueryDto } from './credit-notes.service';
import { Gstr1Service } from './gstr1.service';

@ApiTags('credit-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CreditNotesController {
  constructor(
    private readonly notes: CreditNotesService,
    private readonly gstr1: Gstr1Service,
  ) {}

  @Get('invoices/:id/creditable')
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'Each line of an invoice with what was invoiced, already credited and still creditable, and the s.34(2) deadline' })
  creditable(@Param('id') id: string) {
    return this.notes.creditable(id);
  }

  @Get('invoices/:id/credit-notes')
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'Every credit note against one invoice' })
  forInvoice(@Param('id') id: string) {
    return this.notes.forInvoice(id);
  }

  @Post('invoices/:id/credit-notes')
  @RequirePermission('creditNotes.issue')
  @ApiOperation({
    summary: 'Issue a GST credit note against an invoice',
    description:
      'Per line, either a quantity coming back (valued in proportion, the last packs take exactly what is left) or a ' +
      'GST-inclusive amount off the price. Nothing can be credited beyond what was invoiced on a line. B2B notes get an ' +
      'IRN (type CRN) when the invoice has one.',
  })
  issue(@Param('id') id: string, @Body() dto: IssueCreditNoteDto, @CurrentUser() user: JwtPayload) {
    return this.notes.issue(id, dto, user.sub);
  }

  @Get('credit-notes')
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'Credit notes, newest first. Filters: status, B2B/B2C, reason, date range, search' })
  list(@CurrentUser() user: JwtPayload, @Query() q: ListCreditNotesQueryDto) {
    return this.notes.list(user, q);
  }

  @Get('credit-notes/:id')
  @RequirePermission('invoices.view')
  @ApiOperation({ summary: 'One credit note with lines, HSN summary, the invoice it reduces and its IRN' })
  get(@Param('id') id: string) {
    return this.notes.get(id);
  }

  @Post('credit-notes/:id/einvoice/retry')
  @RequirePermission('invoices.issue')
  @ApiOperation({ summary: 'Submit a pending or failed B2B credit note to the GSP again' })
  retry(@Param('id') id: string) {
    return this.notes.retryIrn(id);
  }

  @Post('credit-notes/:id/cancel')
  @RequirePermission('invoices.cancel')
  @ApiOperation({ summary: 'Cancel a credit note issued in error - only in its own month, and within 24h of its IRN' })
  cancel(@Param('id') id: string, @Body() dto: CancelCreditNoteDto, @CurrentUser() user: JwtPayload) {
    return this.notes.cancel(id, dto, user.sub);
  }

  @Get('gst-returns/gstr1')
  @RequirePermission('gstReturns.view')
  @ApiOperation({
    summary: 'GSTR-1 for a month (month=YYYY-MM): per-table summary, HSN, documents issued, warnings, and the portal JSON',
    description: 'Built from the invoices and credit notes in this system. For review in the GST offline tool before filing - nothing is filed.',
  })
  gstr1Summary(@Query('month') month: string) {
    return this.gstr1.build(month);
  }

  @Get('gst-returns/gstr1/download')
  @RequirePermission('gstReturns.view')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @ApiOperation({ summary: 'The GSTR-1 JSON for the month as a file, in the portal / offline tool layout' })
  async gstr1Download(@Query('month') month: string, @Res() res: Response) {
    const r = await this.gstr1.build(month);
    res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${r.gstin}_${r.gstr1.fp}.json"`);
    res.send(JSON.stringify(r.gstr1, null, 2));
  }
}
