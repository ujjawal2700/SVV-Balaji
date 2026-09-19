import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CustomerType, SalesChannel } from '@prisma/client';
import { StorefrontCatalogueService } from './storefront-catalogue.service';

/**
 * Deliberately unguarded. This is the one surface a shopper reaches before
 * signing in - the same reason a physical shop does not lock its window
 * display. `StorefrontCatalogueService` only ever returns products staff have
 * marked `showOnStorefront`, so nothing internal leaks through it.
 */
@ApiTags('storefront-catalogue')
@Controller('storefront/catalogue')
export class StorefrontCatalogueController {
  constructor(private readonly service: StorefrontCatalogueService) {}

  @Get('products')
  @ApiOperation({
    summary: 'Browse the published catalogue',
    description:
      'channel decides which price list applies. Anonymous browsing defaults to B2C; a signed-in ' +
      'retailer\'s client should pass channel=B2B and its own customerType.',
  })
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'customerType', enum: CustomerType, required: false })
  @ApiQuery({
    name: 'categorySlug',
    required: false,
    description: 'A parent category slug also returns everything filed under its subcategories.',
  })
  @ApiQuery({ name: 'topPick', required: false, type: Boolean })
  @ApiQuery({ name: 'dailyStaple', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('channel') channel: SalesChannel = SalesChannel.B2C,
    @Query('customerType') customerType?: CustomerType,
    @Query('categorySlug') categorySlug?: string,
    @Query('topPick') topPick?: string,
    @Query('dailyStaple') dailyStaple?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.service.listProducts({
      channel,
      customerType,
      categorySlug,
      topPick: topPick === 'true',
      dailyStaple: dailyStaple === 'true',
      // A non-numeric limit would reach Prisma as NaN and 500 - ignore it instead.
      limit: parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : undefined,
    });
  }

  @Get('products/:idOrSlug')
  @ApiOperation({
    summary: 'One published product, with every detail-page section',
    description:
      'Accepts an id or a slug. Returns variants, specifications, FAQs, offers, order limits ' +
      'and the wholesale tier ladder for the requested channel.',
  })
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'customerType', enum: CustomerType, required: false })
  async get(
    @Param('idOrSlug') idOrSlug: string,
    @Query('channel') channel: SalesChannel = SalesChannel.B2C,
    @Query('customerType') customerType?: CustomerType,
  ) {
    const product = await this.service.getProduct(idOrSlug, { channel, customerType });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
