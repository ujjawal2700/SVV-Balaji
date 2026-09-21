import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SetBatchHoldDto } from './dto/recall.dto';
import { RecallService } from './recall.service';

@ApiTags('recall')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('recall')
export class RecallController {
  constructor(private readonly service: RecallService) {}

  @Get('forward')
  @RequirePermission('recall.view')
  @ApiOperation({ summary: 'Forward trace: every order/customer that received an FG batch or RM lot' })
  @ApiQuery({ name: 'code', description: 'FG-… or RM-…' })
  forward(@Query('code') code?: string) {
    return this.service.forward(code ?? '');
  }

  @Get('backward/:fgBatchNumber')
  @RequirePermission('recall.view')
  @ApiOperation({
    summary: 'Backward trace: machine, milling loss, raw lots, weighing slip, payout, FIFO check',
  })
  backward(@Param('fgBatchNumber') fgBatchNumber: string) {
    return this.service.backward(fgBatchNumber);
  }

  @Post('hold')
  @RequirePermission('recall.manage')
  @ApiOperation({ summary: 'Freeze, recall or release finished goods batches' })
  hold(@Body() dto: SetBatchHoldDto, @CurrentUser() user: JwtPayload) {
    return this.service.setHold(dto.fgBatchNumbers, dto.status, dto.reason, user.sub);
  }
}
