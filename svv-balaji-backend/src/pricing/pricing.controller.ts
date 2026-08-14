import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CustomerType, SalesChannel } from '@prisma/client';
import { PricingService } from './pricing.service';
import {
  CreatePriceListDto,
  SetPriceListActiveDto,
  SupersedePriceDto,
} from './dto/pricing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('price-lists')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post()
  @RequirePermission('priceLists.create')
  @ApiOperation({
    summary: 'Define a price for one product in one channel (WS1.6)',
    description:
      'Prices are dated rules, not product columns, so B2B and B2C rates coexist without ' +
      'colliding and historical invoices stay reproducible. Overlapping active rules for the ' +
      'same product, channel, customer type and quantity break are refused.',
  })
  create(@Body() dto: CreatePriceListDto, @CurrentUser() user: JwtPayload) {
    return this.pricingService.create(dto, user.sub);
  }

  @Get()
  @RequirePermission('priceLists.view')
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(
    @Query('productId') productId?: string,
    @Query('channel') channel?: SalesChannel,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.pricingService.findAll({
      productId,
      channel,
      activeOnly: activeOnly === 'true',
    });
  }

  @Get('resolve')
  @RequirePermission('priceLists.view')
  @ApiOperation({
    summary: 'Which price applies to this line, and why',
    description:
      'The same resolution the order module runs at placement. A customer-type rule beats a ' +
      'channel-wide rule, the highest qualifying quantity break wins, then the most recent ' +
      'effective date. Returns the rule that was applied so it can be shown on screen.',
  })
  @ApiQuery({ name: 'channel', enum: SalesChannel })
  @ApiQuery({ name: 'customerType', enum: CustomerType, required: false })
  @ApiQuery({ name: 'on', required: false, description: 'ISO date - defaults to today' })
  resolve(
    @Query('productId') productId: string,
    @Query('channel') channel: SalesChannel,
    @Query('quantity') quantity: string,
    @Query('customerType') customerType?: CustomerType,
    @Query('on') on?: string,
  ) {
    return this.pricingService.resolve({
      productId,
      channel,
      customerType,
      quantity: Number(quantity ?? 1),
      on: on ? new Date(on) : undefined,
    });
  }

  @Get('product/:productId/comparison')
  @RequirePermission('priceLists.view')
  @ApiOperation({ summary: 'What this product costs in each channel today' })
  comparison(@Param('productId') productId: string) {
    return this.pricingService.channelComparison(productId);
  }

  @Post(':id/supersede')
  @RequirePermission('priceLists.supersede')
  @ApiOperation({
    summary: 'Replace a rate from a given date',
    description:
      'The only supported way to change a price. Closes the existing rule the instant before the ' +
      'new one starts, so orders already placed keep the rate they were priced at.',
  })
  supersede(
    @Param('id') id: string,
    @Body() dto: SupersedePriceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pricingService.supersede(id, dto, user.sub);
  }

  @Patch(':id/active')
  @RequirePermission('priceLists.status')
  setActive(@Param('id') id: string, @Body() dto: SetPriceListActiveDto) {
    return this.pricingService.setActive(id, dto);
  }
}
