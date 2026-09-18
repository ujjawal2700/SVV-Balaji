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
  @ApiQuery({ name: 'categorySlug', required: false })
  list(
    @Query('channel') channel: SalesChannel = SalesChannel.B2C,
    @Query('customerType') customerType?: CustomerType,
    @Query('categorySlug') categorySlug?: string,
  ) {
    return this.service.listProducts({ channel, customerType, categorySlug });
  }

  @Get('products/:id')
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'customerType', enum: CustomerType, required: false })
  async get(
    @Param('id') id: string,
    @Query('channel') channel: SalesChannel = SalesChannel.B2C,
    @Query('customerType') customerType?: CustomerType,
  ) {
    const product = await this.service.getProduct(id, { channel, customerType });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
