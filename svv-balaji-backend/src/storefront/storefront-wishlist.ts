import { Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Injectable, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import type { CustomerJwtPayload } from './strategies/customer-jwt.strategy';

/** A customer's saved-for-later list. Product details/prices come from the catalogue, not from here. */
@Injectable()
export class StorefrontWishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private customerIdOf(c: CustomerJwtPayload): string {
    if (!c.customerId) throw new ForbiddenException('Your account has no customer record yet.');
    return c.customerId;
  }

  async list(c: CustomerJwtPayload) {
    const rows = await this.prisma.customerWishlistItem.findMany({
      where: { customerId: this.customerIdOf(c) },
      orderBy: { createdAt: 'desc' },
      select: { productId: true, createdAt: true },
    });
    return rows;
  }

  async add(c: CustomerJwtPayload, productId: string) {
    const customerId = this.customerIdOf(c);
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.customerWishlistItem.upsert({
      where: { customerId_productId: { customerId, productId } },
      update: {},
      create: { customerId, productId },
    });
    return { saved: true };
  }

  async remove(c: CustomerJwtPayload, productId: string) {
    await this.prisma.customerWishlistItem.deleteMany({ where: { customerId: this.customerIdOf(c), productId } });
    return { saved: false };
  }
}

@ApiTags('storefront-wishlist')
@ApiBearerAuth()
@UseGuards(CustomerJwtAuthGuard)
@Controller('storefront/wishlist')
export class StorefrontWishlistController {
  constructor(private readonly service: StorefrontWishlistService) {}

  @Get()
  @ApiOperation({ summary: 'My saved products (ids, newest first)' })
  list(@CurrentCustomer() c: CustomerJwtPayload) {
    return this.service.list(c);
  }

  @Put(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a product (idempotent)' })
  add(@CurrentCustomer() c: CustomerJwtPayload, @Param('productId') productId: string) {
    return this.service.add(c, productId);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Remove a saved product (idempotent)' })
  remove(@CurrentCustomer() c: CustomerJwtPayload, @Param('productId') productId: string) {
    return this.service.remove(c, productId);
  }
}
