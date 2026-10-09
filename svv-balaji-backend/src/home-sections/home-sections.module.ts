import { Module } from '@nestjs/common';
import {
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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import {
  BannerAudience,
  CustomerType,
  HomeSection,
  HomeSectionKind,
  HomeSectionLayout,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { StorefrontCatalogueModule } from '../storefront/storefront-catalogue.module';
import { StorefrontCatalogueService } from '../storefront/storefront-catalogue.service';

export const PRICE_TILE_COLORS = ['purple', 'orange', 'green', 'blue', 'red', 'teal'] as const;

/** One "Starting from ₹X" tile of a PRICE_DEALS section. */
export class PriceTileDto {
  @ApiProperty({ example: 'Starting from' })
  @IsString()
  @MaxLength(40)
  label: string;

  @ApiProperty({ example: 79 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 'Namkeens & snacks' })
  @IsString()
  @MaxLength(60)
  subtitle: string;

  @ApiPropertyOptional({ example: '🍟' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @ApiProperty({ enum: PRICE_TILE_COLORS })
  @IsIn(PRICE_TILE_COLORS)
  color: (typeof PRICE_TILE_COLORS)[number];

  @ApiPropertyOptional({ description: 'Category the tile opens; null opens the full catalogue.', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class CreateHomeSectionDto {
  @ApiProperty({ description: 'Title of the home section e.g. "Best of the Basics"' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Optional subtitle e.g. "Farm-fresh flour, namkeen, spices & kitchen essentials"' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ enum: HomeSectionKind, description: 'What fills the section. Default PRODUCTS (hand-picked).' })
  @IsOptional()
  @IsEnum(HomeSectionKind)
  kind?: HomeSectionKind;

  @ApiPropertyOptional({ enum: HomeSectionLayout, description: 'Card style for product kinds. Default SHELF.' })
  @IsOptional()
  @IsEnum(HomeSectionLayout)
  layout?: HomeSectionLayout;

  @ApiPropertyOptional({ enum: BannerAudience })
  @IsOptional()
  @IsEnum(BannerAudience)
  targetAudience?: BannerAudience;

  @ApiPropertyOptional({ description: 'Display order / position rank on the homepage' })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Array of product UUIDs to show in this section (PRODUCTS kind)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional({ description: 'Max products shown by DAILY_STAPLES / TOP_PICKS sections (1-48).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  productLimit?: number;

  @ApiPropertyOptional({ type: [PriceTileDto], description: 'PRICE_DEALS sections only.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PriceTileDto)
  tiles?: PriceTileDto[];
}

export class UpdateHomeSectionDto extends PartialType(CreateHomeSectionDto) {}

function parseTiles(raw: Prisma.JsonValue): PriceTileDto[] {
  return Array.isArray(raw) ? (raw as unknown as PriceTileDto[]) : [];
}

@Injectable()
export class HomeSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storefrontCatalogue: StorefrontCatalogueService,
  ) {}

  async create(dto: CreateHomeSectionDto) {
    return this.prisma.homeSection.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        kind: dto.kind ?? HomeSectionKind.PRODUCTS,
        layout: dto.layout ?? HomeSectionLayout.SHELF,
        targetAudience: dto.targetAudience ?? BannerAudience.ALL,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        productIds: dto.productIds ?? [],
        productLimit: dto.productLimit ?? 12,
        tiles: (dto.tiles ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Admin preview of what a section shows. Hand-picked sections keep their
   * saved order; auto sections are resolved from the product flags the same
   * way the storefront does, so the admin table reflects what shoppers see.
   */
  private async previewProducts(sec: HomeSection) {
    const select = {
      id: true,
      name: true,
      images: true,
      mrp: true,
      packLabel: true,
      category: { select: { name: true } },
    } as const;
    if (sec.kind === HomeSectionKind.PRODUCTS) {
      if (sec.productIds.length === 0) return [];
      const rows = await this.prisma.product.findMany({ where: { id: { in: sec.productIds } }, select });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return sec.productIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    }
    if (sec.kind === HomeSectionKind.DAILY_STAPLES || sec.kind === HomeSectionKind.TOP_PICKS) {
      return this.prisma.product.findMany({
        where: {
          isActive: true,
          showOnStorefront: true,
          ...(sec.kind === HomeSectionKind.DAILY_STAPLES ? { isDailyStaple: true } : { isTopPick: true }),
        },
        select,
        orderBy: { name: 'asc' },
        take: sec.productLimit,
      });
    }
    return [];
  }

  async findAll(includeInactive = false) {
    const sections = await this.prisma.homeSection.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return Promise.all(sections.map(async (sec) => ({ ...sec, products: await this.previewProducts(sec) })));
  }

  async findOne(id: string) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');
    return { ...section, products: await this.previewProducts(section) };
  }

  async update(id: string, dto: UpdateHomeSectionDto) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');

    return this.prisma.homeSection.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.layout !== undefined ? { layout: dto.layout } : {}),
        ...(dto.targetAudience !== undefined ? { targetAudience: dto.targetAudience } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
        ...(dto.productLimit !== undefined ? { productLimit: dto.productLimit } : {}),
        ...(dto.tiles !== undefined ? { tiles: dto.tiles as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');
    if (section.isActive === isActive) return section;
    return this.prisma.homeSection.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');
    await this.prisma.homeSection.delete({ where: { id } });
  }

  async listPublic(audience?: BannerAudience) {
    const sections = await this.prisma.homeSection.findMany({
      where: {
        isActive: true,
        targetAudience: audience ? { in: [BannerAudience.ALL, audience] } : undefined,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const channel = audience === BannerAudience.B2B ? SalesChannel.B2B : SalesChannel.B2C;
    const customerType = audience === BannerAudience.B2B ? CustomerType.RETAILER : CustomerType.CONSUMER;

    // Price tiles link to a category by id; resolve every slug in one query.
    const tileCategoryIds = sections
      .filter((sec) => sec.kind === HomeSectionKind.PRICE_DEALS)
      .flatMap((sec) => parseTiles(sec.tiles).map((t) => t.categoryId))
      .filter((id): id is string => Boolean(id));
    // The storefront routes on /products/<main slug>[?sub=<sub slug>], so a
    // sub-category tile needs its parent's slug too.
    const slugById = new Map<string, { slug: string; parentSlug: string | null }>();
    if (tileCategoryIds.length) {
      const cats = await this.prisma.category.findMany({
        where: { id: { in: tileCategoryIds }, isActive: true },
        select: { id: true, slug: true, parent: { select: { slug: true } } },
      });
      cats.forEach((c) => slugById.set(c.id, { slug: c.slug, parentSlug: c.parent?.slug ?? null }));
    }

    const resolved = await Promise.all(
      sections.map(async (sec) => {
        let products: Awaited<ReturnType<StorefrontCatalogueService['listProductsByIds']>> = [];
        if (sec.kind === HomeSectionKind.PRODUCTS) {
          products = await this.storefrontCatalogue.listProductsByIds(sec.productIds, { channel, customerType });
        } else if (sec.kind === HomeSectionKind.DAILY_STAPLES || sec.kind === HomeSectionKind.TOP_PICKS) {
          products = await this.storefrontCatalogue.listProducts({
            channel,
            customerType,
            limit: sec.productLimit,
            ...(sec.kind === HomeSectionKind.DAILY_STAPLES ? { dailyStaple: true } : { topPick: true }),
          });
        }
        const tiles =
          sec.kind === HomeSectionKind.PRICE_DEALS
            ? parseTiles(sec.tiles).map((t) => {
                const cat = t.categoryId ? slugById.get(t.categoryId) : undefined;
                return {
                  ...t,
                  categorySlug: cat?.slug ?? null,
                  parentCategorySlug: cat?.parentSlug ?? null,
                };
              })
            : [];
        return {
          id: sec.id,
          title: sec.title,
          subtitle: sec.subtitle,
          kind: sec.kind,
          layout: sec.layout,
          displayOrder: sec.displayOrder,
          targetAudience: sec.targetAudience,
          products,
          tiles,
        };
      }),
    );
    // An empty section is hidden rather than drawn as a bare header.
    return resolved.filter((sec) =>
      sec.kind === HomeSectionKind.PRICE_DEALS ? sec.tiles.length > 0 : sec.products.length > 0,
    );
  }
}

@ApiTags('home-sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('home-sections')
export class HomeSectionsController {
  constructor(private readonly homeSectionsService: HomeSectionsService) {}

  @Post()
  @RequirePermission('homeSections.create')
  create(@Body() dto: CreateHomeSectionDto) {
    return this.homeSectionsService.create(dto);
  }

  @Get()
  @RequirePermission('homeSections.view')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.homeSectionsService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission('homeSections.view')
  findOne(@Param('id') id: string) {
    return this.homeSectionsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('homeSections.edit')
  update(@Param('id') id: string, @Body() dto: UpdateHomeSectionDto) {
    return this.homeSectionsService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('homeSections.edit')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.homeSectionsService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @RequirePermission('homeSections.delete')
  remove(@Param('id') id: string) {
    return this.homeSectionsService.remove(id);
  }
}

@ApiTags('storefront-home-sections')
@Controller('storefront/home-sections')
export class StorefrontHomeSectionsController {
  constructor(private readonly homeSectionsService: HomeSectionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Active homepage sections configured by Super Admin (product shelves and price tiles)',
  })
  @ApiQuery({ name: 'audience', enum: BannerAudience, required: false })
  list(@Query('audience') audience?: BannerAudience) {
    return this.homeSectionsService.listPublic(audience);
  }
}

@Module({
  imports: [StorefrontCatalogueModule],
  controllers: [HomeSectionsController, StorefrontHomeSectionsController],
  providers: [HomeSectionsService],
  exports: [HomeSectionsService],
})
export class HomeSectionsModule {}
