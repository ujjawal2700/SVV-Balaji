import { Module } from '@nestjs/common';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

const CATEGORY_SELECT = { select: { id: true, name: true, slug: true } };

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  sku: string;

  @ApiProperty({ description: 'KG | LITRE | PACK' })
  @IsString()
  unit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Shopper-facing copy, distinct from the operations name/SKU' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: 'Whether this SKU is published to the storefront catalogue' })
  @IsOptional()
  @IsBoolean()
  showOnStorefront?: boolean;

  @ApiPropertyOptional({ description: 'URL-safe. Auto-derived from the name if left blank.' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'Available quantity at or below this flags the product low-stock.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ description: 'Held back from what a storefront order can allocate.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStock?: number;

  @ApiPropertyOptional({ description: 'Whether an order may be placed once available stock is exhausted.' })
  @IsOptional()
  @IsBoolean()
  allowBackorder?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

/** "Multigrain Atta 1kg" -> "multigrain-atta-1kg". Mirrors CategoriesService's slugify. */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const clash = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (clash) {
      throw new ConflictException(
        `SKU ${dto.sku} already belongs to "${clash.name}". SKUs are unique across the catalogue.`,
      );
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    const slug = dto.slug || dto.showOnStorefront ? await this.uniqueSlug(dto.slug || dto.name) : undefined;

    return this.prisma.product.create({
      data: { ...dto, slug },
      include: { category: CATEGORY_SELECT },
    });
  }

  /**
   * Active-only by default, because almost every caller is a picker and a
   * discontinued product must not be selectable on a new recipe or order.
   * The product master screen passes `includeInactive` so that a product can
   * be seen and brought back - without it, deactivating one would hide it from
   * the only screen able to reactivate it.
   */
  findAll(includeInactive = false) {
    return this.prisma.product.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      include: { category: CATEGORY_SELECT },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: CATEGORY_SELECT,
        recipes: { select: { id: true, recipeCode: true, version: true, status: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku && dto.sku !== product.sku) {
      const clash = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (clash) {
        throw new ConflictException(
          `SKU ${dto.sku} already belongs to "${clash.name}". SKUs are unique across the catalogue.`,
        );
      }
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    const slug =
      dto.slug && dto.slug !== product.slug ? await this.uniqueSlug(dto.slug, id) : undefined;

    return this.prisma.product.update({
      where: { id },
      data: { ...dto, ...(slug ? { slug } : {}) },
      include: { category: CATEGORY_SELECT },
    });
  }

  /** Discontinuing a product. History, recipes and past orders are untouched. */
  async setActive(id: string, isActive: boolean) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.isActive === isActive) return product;

    return this.prisma.product.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const [recipes, productionBatches, finishedGoods, priceLists, orderItems] =
      await this.prisma.$transaction([
        this.prisma.recipe.count({ where: { productId: id } }),
        this.prisma.productionBatch.count({ where: { productId: id } }),
        this.prisma.finishedGoodsBatch.count({ where: { productId: id } }),
        this.prisma.priceList.count({ where: { productId: id } }),
        this.prisma.orderItem.count({ where: { productId: id } }),
      ]);

    assertDeletable('Product', product.name, {
      recipes,
      batches: productionBatches + finishedGoods,
      'price lists': priceLists,
      'order lines': orderItems,
    });

    await this.prisma.product.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Sellable quantity per product across every warehouse, against the
   * reorder point and safety stock thresholds - the same aggregation
   * StorefrontCatalogueService does per-product, run here for every active
   * product at once so the inventory screen is one call, not N.
   */
  async stockSummary() {
    const [products, stockRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          reorderPoint: true,
          safetyStock: true,
          allowBackorder: true,
          category: CATEGORY_SELECT,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.finishedGoodsStock.findMany({
        where: {
          fgBatch: {
            qaReleased: true,
            OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
          },
        },
        select: {
          quantity: true,
          reservedQuantity: true,
          fgBatch: { select: { productId: true } },
        },
      }),
    ]);

    const availableByProduct = new Map<string, number>();
    for (const row of stockRows) {
      const productId = row.fgBatch.productId;
      const net = row.quantity - row.reservedQuantity;
      availableByProduct.set(productId, (availableByProduct.get(productId) ?? 0) + net);
    }

    return products.map((product) => {
      const available = Math.max(0, availableByProduct.get(product.id) ?? 0);
      const reorderPoint = product.reorderPoint ?? 0;
      const safetyStock = product.safetyStock ?? 0;
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        category: product.category,
        availableQuantity: available,
        reorderPoint,
        safetyStock,
        allowBackorder: product.allowBackorder,
        // Below safety stock is worse than merely "low" - it is the buffer
        // meant to survive a supply hiccup, already eaten into.
        status:
          available <= safetyStock
            ? ('CRITICAL' as const)
            : available <= reorderPoint
              ? ('LOW' as const)
              : ('OK' as const),
      };
    });
  }

  /** Appends -2, -3, ... on collision. Mirrors CategoriesService's uniqueSlug. */
  private async uniqueSlug(source: string, excludingId?: string): Promise<string> {
    const base = slugify(source) || 'product';
    let candidate = base;
    let n = 1;
    for (;;) {
      const clash = await this.prisma.product.findFirst({
        where: { slug: candidate, ...(excludingId ? { id: { not: excludingId } } : {}) },
      });
      if (!clash) return candidate;
      n += 1;
      candidate = `${base}-${n}`;
    }
  }
}

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermission('products.create')
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  @RequirePermission('products.view')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.productsService.findAll(includeInactive === 'true');
  }

  @Get('stock-summary')
  @RequirePermission('products.view')
  @ApiOperation({
    summary: 'Available stock per product against its reorder/safety thresholds',
    description: 'Every active product, one row each, with QA-released sellable quantity aggregated across all warehouses.',
  })
  stockSummary() {
    return this.productsService.stockSummary();
  }

  @Get(':id')
  @RequirePermission('products.view')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('products.edit')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('products.edit')
  @ApiOperation({
    summary: 'Discontinue or reinstate a product',
    description:
      'A discontinued product disappears from recipe and order pickers. Existing recipes, ' +
      'batches and order history are untouched.',
  })
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.productsService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @RequirePermission('products.delete')
  @ApiOperation({
    summary: 'Permanently delete a product',
    description:
      'Only while nothing references it. Any recipe, batch, price list or order line ' +
      'blocks it - discontinue instead.',
  })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
