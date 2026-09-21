import { Module } from '@nestjs/common';
import {
  BadRequestException,
  Body,
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
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { LoyaltyEligibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertDeletable } from '../common/dependants';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'URL-safe. Auto-derived from the name if left blank.',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    enum: LoyaltyEligibility,
    description: 'Loyalty default for products in this category. INHERIT = follow the parent, then the program default.',
  })
  @IsOptional()
  @IsEnum(LoyaltyEligibility)
  loyaltyEligibility?: LoyaltyEligibility;

  @ApiPropertyOptional({ description: 'Parent category, for a two-level hierarchy.' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: CategoryTreeNode[];
}

/** "Multigrain Flours" -> "multigrain-flours". */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = await this.uniqueSlug(dto.slug || dto.name);

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        parentId: dto.parentId,
        loyaltyEligibility: dto.loyaltyEligibility,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  findAll(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true, products: true } },
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, isActive: true } },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
      if (parent.parentId === id) {
        throw new BadRequestException(
          'That would make this category both the parent and the child of the same category',
        );
      }
    }

    const slug =
      dto.slug && dto.slug !== category.slug ? await this.uniqueSlug(dto.slug, id) : undefined;

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        parentId: dto.parentId,
        loyaltyEligibility: dto.loyaltyEligibility,
        displayOrder: dto.displayOrder,
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isActive === isActive) return category;
    return this.prisma.category.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    const [children, products] = await this.prisma.$transaction([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);

    assertDeletable('Category', category.name, { 'child categories': children, products });

    await this.prisma.category.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * The storefront's shape: active categories only, nested two levels deep
   * (parent -> children), each carrying just what a shopper's screen needs.
   * Unlike `findAll`, this never returns a category whose parent is hidden -
   * an inactive parent with active children would otherwise leave those
   * children floating with nothing to nest under.
   */
  async listPublicTree() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, imageUrl: true, parentId: true },
    });

    const byParent = new Map<string | null, typeof categories>();
    for (const category of categories) {
      const key = category.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(category);
    }

    const build = (parentId: string | null): CategoryTreeNode[] =>
      (byParent.get(parentId) ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        children: build(category.id),
      }));

    return build(null);
  }

  /** Appends -2, -3, ... on collision, the same way SKU/slug-ish uniqueness is handled elsewhere. */
  private async uniqueSlug(source: string, excludingId?: string): Promise<string> {
    const base = slugify(source) || 'category';
    let candidate = base;
    let n = 1;
    for (;;) {
      const clash = await this.prisma.category.findFirst({
        where: { slug: candidate, ...(excludingId ? { id: { not: excludingId } } : {}) },
      });
      if (!clash) return candidate;
      n += 1;
      candidate = `${base}-${n}`;
    }
  }
}

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission('categories.create')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  @RequirePermission('categories.view')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.categoriesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission('categories.view')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('categories.edit')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('categories.edit')
  @ApiOperation({
    summary: 'Show or hide a category',
    description: 'A hidden category disappears from the storefront and product pickers. Products keep their assignment.',
  })
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.categoriesService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @RequirePermission('categories.delete')
  @ApiOperation({
    summary: 'Permanently delete a category',
    description: 'Only while it has no child categories and no products assigned. Hide it instead otherwise.',
  })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}

/**
 * Deliberately unguarded, same reasoning as StorefrontCatalogueController and
 * StorefrontBannersController: read before a shopper signs in, and only ever
 * returns what staff have published (`isActive: true`).
 */
@ApiTags('storefront-categories')
@Controller('storefront/categories')
export class StorefrontCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Active categories, nested two levels deep, for storefront navigation' })
  tree() {
    return this.categoriesService.listPublicTree();
  }
}

@Module({
  controllers: [CategoriesController, StorefrontCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
