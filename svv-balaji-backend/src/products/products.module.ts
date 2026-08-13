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
import { IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
  category?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

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
    return this.prisma.product.create({ data: dto });
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
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { recipes: { select: { id: true, recipeCode: true, version: true, status: true } } },
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

    return this.prisma.product.update({ where: { id }, data: dto });
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
}

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.productsService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/active')
  @Roles(UserRole.SUPER_ADMIN)
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
  @Roles(UserRole.SUPER_ADMIN)
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
