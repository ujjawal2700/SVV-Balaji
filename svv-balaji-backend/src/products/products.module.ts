import { Module } from '@nestjs/common';
import {
  BadRequestException,
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
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LoyaltyEligibility, Prisma, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingModule } from '../pricing/pricing.module';
import { PricingService } from '../pricing/pricing.service';
import { assertDeletable } from '../common/dependants';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

const CATEGORY_SELECT = { select: { id: true, name: true, slug: true } };

/// Includes the parent so the admin screen can show "Atta & Flour > Chakki Atta"
/// and prefill its main-category / subcategory pair without a second lookup.
const CATEGORY_WITH_PARENT = {
  select: {
    id: true,
    name: true,
    slug: true,
    parent: { select: { id: true, name: true, slug: true } },
  },
};

/// The ordered child lists, in the shape every read of a product returns them.
const CONTENT_INCLUDE = {
  variants: { orderBy: { displayOrder: 'asc' } },
  specifications: { orderBy: { displayOrder: 'asc' } },
  faqs: { orderBy: { displayOrder: 'asc' } },
  offers: { orderBy: { displayOrder: 'asc' } },
} as const;

export class PriceTierDto {
  @ApiProperty({ description: 'This rate applies from this quantity up.' })
  @IsInt()
  @Min(1)
  minQuantity: number;

  @ApiPropertyOptional({ description: 'Per-unit price, exclusive of GST. Send this OR totalPrice.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({
    description:
      'Total price, exclusive of GST, for minQuantity units (5 packs -> 2750). The per-unit price ' +
      'is derived as total / minQuantity. Send this OR unitPrice.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;
}

/**
 * One tier as the pricing engine wants it. The engine bills unitPrice x
 * quantity, so a total-for-quantity tier is stored as its per-unit equivalent
 * (with the typed total kept alongside for the admin form to show back).
 */
export function resolveTier(tier: PriceTierDto): { minQuantity: number; unitPrice: number; tierTotal: number | null } {
  const hasUnit = tier.unitPrice !== undefined && tier.unitPrice !== null;
  const hasTotal = tier.totalPrice !== undefined && tier.totalPrice !== null;
  if (hasUnit === hasTotal) {
    throw new BadRequestException(
      `The tier starting at ${tier.minQuantity} units needs exactly one of unitPrice or totalPrice`,
    );
  }
  if (hasTotal) {
    return {
      minQuantity: tier.minQuantity,
      unitPrice: Math.round((tier.totalPrice! / tier.minQuantity) * 100) / 100,
      tierTotal: tier.totalPrice!,
    };
  }
  return { minQuantity: tier.minQuantity, unitPrice: tier.unitPrice!, tierTotal: null };
}

/**
 * What the Add/Edit Product screen sends for one sellable unit (the product
 * itself or one variant). Each field is optional and each is authoritative
 * when present: `b2bTiers` replaces the whole wholesale ladder, and leaving it
 * out leaves the channel's live rules untouched.
 */
export class ChannelPricingDto {
  @ApiPropertyOptional({ description: 'B2C selling price for one unit (quantity break 1).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  b2cPrice?: number;

  @ApiPropertyOptional({ type: [PriceTierDto], description: 'The full B2B quantity-break ladder.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  b2bTiers?: PriceTierDto[];
}

export class ProductPricingDto extends ChannelPricingDto {
  @ApiPropertyOptional({ default: 5, description: 'GST % written onto every price rule for this product.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRatePercent?: number;
}

export class ProductVariantDto {
  @ApiPropertyOptional({ description: 'Omit to create; pass an existing id to update in place.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ type: ChannelPricingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPricingDto)
  pricing?: ChannelPricingDto;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  sku: string;

  @ApiPropertyOptional({ description: 'Falls back to the parent product unit.' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductSpecificationDto {
  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty()
  @IsString()
  value: string;
}

export class ProductFaqDto {
  @ApiProperty()
  @IsString()
  question: string;

  @ApiProperty()
  @IsString()
  answer: string;
}

export class ProductOfferDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;
}

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

  // --- Product detail page content ---------------------------------------

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Pack descriptor a shopper reads - "10kg Bag", "100g x 20".' })
  @IsOptional()
  @IsString()
  packLabel?: string;

  @ApiPropertyOptional({ description: 'Struck-through reference price. The sell price is a PriceList rule.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badge?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @ApiPropertyOptional({ description: 'Display-only until a real review subsystem exists.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  reviewCount?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  highlights?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shelfLife?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  disclaimer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional({ description: 'B2C minimum per order line.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minOrderQuantity?: number;

  @ApiPropertyOptional({ description: 'B2C maximum per order line.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOrderQuantity?: number;

  @ApiPropertyOptional({ description: 'B2B minimum order quantity (MOQ).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  moqB2B?: number;

  @ApiPropertyOptional({ description: 'B2B maximum per order.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOrderQuantityB2B?: number;

  @ApiPropertyOptional({ description: 'Units per master/corrugated box.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  packBoxSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bulkAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  gstInvoiceAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessSupportContact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @ApiPropertyOptional({
    description: 'How the B2B tier table is entered: true = each tier is a total for its quantity.',
  })
  @IsOptional()
  @IsBoolean()
  b2bTiersAreTotals?: boolean;

  @ApiPropertyOptional({
    enum: LoyaltyEligibility,
    description: 'Loyalty override for this product. INHERIT = follow the category, then the program default.',
  })
  @IsOptional()
  @IsEnum(LoyaltyEligibility)
  loyaltyEligibility?: LoyaltyEligibility;

  @ApiPropertyOptional({ description: 'Pin to the "Popular Products" shelf and category Top Picks.' })
  @IsOptional()
  @IsBoolean()
  isTopPick?: boolean;

  @ApiPropertyOptional({ description: 'Pin to the "Best of the Basics" shelf.' })
  @IsOptional()
  @IsBoolean()
  isDailyStaple?: boolean;

  @ApiPropertyOptional({ type: ProductPricingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductPricingDto)
  pricing?: ProductPricingDto;

  // --- Ordered child lists -----------------------------------------------
  // Each is authoritative when present: passing a list replaces that section
  // wholesale, and omitting it leaves the section untouched. Array order is
  // the display order, so reordering on screen needs no separate endpoint.

  @ApiPropertyOptional({ type: [ProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional({ type: [ProductSpecificationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  specifications?: ProductSpecificationDto[];

  @ApiPropertyOptional({ type: [ProductFaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductFaqDto)
  faqs?: ProductFaqDto[];

  @ApiPropertyOptional({ type: [ProductOfferDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductOfferDto)
  offers?: ProductOfferDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

/**
 * Array position is the display order for every child list, so the admin
 * screen reorders a section by sending it back in the order it shows.
 */
function withOrder<T>(row: T, index: number): T & { displayOrder: number } {
  return { ...row, displayOrder: index };
}

function toVariantRow(variant: ProductVariantDto, index: number) {
  return {
    name: variant.name,
    sku: variant.sku,
    // A variant is sent whole, so an absent unit/MRP means "cleared", not
    // "leave as is" - `undefined` would keep a stale value the operator removed.
    unit: variant.unit ?? null,
    mrp: variant.mrp ?? null,
    images: (variant.images ?? []).filter(Boolean),
    isActive: variant.isActive ?? true,
    displayOrder: index,
  };
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async create(dto: CreateProductDto, actorId: string) {
    await this.assertSkuFree(dto.sku);

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    const slug = dto.slug || dto.showOnStorefront ? await this.uniqueSlug(dto.slug || dto.name) : undefined;

    const { variants, specifications, faqs, offers, pricing, ...scalars } = dto;
    await this.assertVariantSkusFree(variants ?? [], dto.sku);

    return this.prisma.$transaction(
      async (tx) => {
        const created = await tx.product.create({
          data: {
            ...scalars,
            slug,
            variants: { create: (variants ?? []).map(toVariantRow) },
            specifications: { create: (specifications ?? []).map(withOrder) },
            faqs: { create: (faqs ?? []).map(withOrder) },
            offers: { create: (offers ?? []).map(withOrder) },
          },
          include: { category: CATEGORY_SELECT, ...CONTENT_INCLUDE },
        });

        // Nested create returns variants in displayOrder, which is the payload
        // order - so the i-th payload variant is the i-th created row.
        await this.syncPrices(
          tx,
          created.id,
          pricing,
          (variants ?? []).map((v, i) => ({ id: created.variants[i].id, pricing: v.pricing })),
          actorId,
        );

        return created;
      },
      // Each variant's ladder is a handful of writes; the default 5s budget is
      // tight for a product with many pack sizes on a cold connection.
      { timeout: 30_000 },
    );
  }

  /**
   * SKUs are unique across the catalogue, but a product SKU and a variant SKU
   * live in different tables, so neither table's unique index sees the other.
   * Both are checked here so a picking slip can resolve any SKU to one thing.
   */
  private async findSkuHolder(sku: string) {
    const [product, variant] = await Promise.all([
      this.prisma.product.findUnique({ where: { sku }, select: { id: true, name: true } }),
      this.prisma.productVariant.findUnique({
        where: { sku },
        select: { id: true, name: true, product: { select: { name: true } } },
      }),
    ]);
    if (product) return { kind: 'product' as const, id: product.id, name: product.name };
    if (variant) {
      return {
        kind: 'variant' as const,
        id: variant.id,
        name: `${variant.product.name} - ${variant.name}`,
      };
    }
    return null;
  }

  private async assertSkuFree(sku: string, exceptProductId?: string) {
    const holder = await this.findSkuHolder(sku);
    if (holder && !(holder.kind === 'product' && holder.id === exceptProductId)) {
      throw new ConflictException(
        `SKU ${sku} already belongs to "${holder.name}". SKUs are unique across the catalogue.`,
      );
    }
  }

  /**
   * Variant SKUs are checked against every product and every variant of any
   * *other* product. A variant may keep its own SKU on update, and a payload
   * that repeats a SKU is refused before it reaches the database.
   */
  private async assertVariantSkusFree(
    variants: ProductVariantDto[],
    ownProductSku: string,
    productId?: string,
  ) {
    const incoming = variants.map((v) => v.sku);
    const duplicateInPayload = incoming.find((sku, i) => incoming.indexOf(sku) !== i);
    if (duplicateInPayload) {
      throw new ConflictException(
        `Variant SKU ${duplicateInPayload} appears twice in this product. Each pack size needs its own SKU.`,
      );
    }
    if (incoming.includes(ownProductSku)) {
      throw new ConflictException(
        `Variant SKU ${ownProductSku} is the product SKU itself. A pack size needs a SKU of its own.`,
      );
    }
    if (incoming.length === 0) return;

    const [products, variantRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { sku: { in: incoming } },
        select: { sku: true, name: true },
      }),
      this.prisma.productVariant.findMany({
        where: { sku: { in: incoming }, ...(productId ? { productId: { not: productId } } : {}) },
        select: { sku: true, name: true, product: { select: { name: true } } },
      }),
    ]);

    const held = products[0]
      ? { sku: products[0].sku, name: products[0].name }
      : variantRows[0]
        ? { sku: variantRows[0].sku, name: `${variantRows[0].product.name} - ${variantRows[0].name}` }
        : null;
    if (held) {
      throw new ConflictException(
        `Variant SKU ${held.sku} already belongs to "${held.name}". SKUs are unique across the catalogue.`,
      );
    }
  }

  /**
   * Turn the form's price fields into dated rules. Runs inside the caller's
   * transaction so a product and its prices commit together.
   *
   * A price section is skipped entirely when the caller did not send it -
   * omitting `pricing` on a PATCH must never close the live ladder.
   */
  private async syncPrices(
    tx: Prisma.TransactionClient,
    productId: string,
    productPricing: ProductPricingDto | undefined,
    variants: Array<{ id: string; pricing?: ChannelPricingDto }>,
    actorId: string,
  ) {
    const gst = await this.resolveGst(tx, productId, productPricing?.gstRatePercent);

    const apply = async (variantId: string | null, block: ChannelPricingDto | undefined) => {
      if (!block) return;
      if (block.b2cPrice !== undefined) {
        await this.pricing.syncLadder(tx, {
          productId,
          variantId,
          channel: SalesChannel.B2C,
          tiers: [{ minQuantity: 1, unitPrice: block.b2cPrice }],
          gstRatePercent: gst,
          createdById: actorId,
        });
      }
      if (block.b2bTiers !== undefined) {
        await this.pricing.syncLadder(tx, {
          productId,
          variantId,
          channel: SalesChannel.B2B,
          tiers: block.b2bTiers.map(resolveTier),
          gstRatePercent: gst,
          createdById: actorId,
        });
      }
    };

    await apply(null, productPricing);
    for (const variant of variants) await apply(variant.id, variant.pricing);
  }

  /** Explicit rate wins; otherwise keep whatever the product already charges; otherwise 5%. */
  private async resolveGst(
    tx: Prisma.TransactionClient,
    productId: string,
    requested: number | undefined,
  ): Promise<number> {
    if (requested !== undefined) return requested;
    const now = new Date();
    const live = await tx.priceList.findFirst({
      where: {
        productId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return live ? Number(live.gstRatePercent) : 5;
  }

  /**
   * Active-only by default, because almost every caller is a picker and a
   * discontinued product must not be selectable on a new recipe or order.
   * The product master screen passes `includeInactive` so that a product can
   * be seen and brought back - without it, deactivating one would hide it from
   * the only screen able to reactivate it.
   *
   * Each row also carries its current headline prices, so the master list can
   * show what a product sells for without a price-list call per row.
   */
  async findAll(includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      include: { category: CATEGORY_WITH_PARENT, _count: { select: { variants: true } } },
    });

    const now = new Date();
    const rules = await this.prisma.priceList.findMany({
      where: {
        productId: { in: products.map((p) => p.id) },
        variantId: null,
        customerType: null,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      select: { productId: true, channel: true, minQuantity: true, unitPrice: true },
      orderBy: { minQuantity: 'asc' },
    });

    return products.map((product) => {
      const own = rules.filter((r) => r.productId === product.id);
      const b2c = own.find((r) => r.channel === SalesChannel.B2C);
      // Lowest break first, so this is the entry-level wholesale price.
      const b2b = own.find((r) => r.channel === SalesChannel.B2B);
      return {
        ...product,
        b2cPrice: b2c ? Number(b2c.unitPrice) : null,
        b2bPrice: b2b ? Number(b2b.unitPrice) : null,
      };
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: CATEGORY_WITH_PARENT,
        recipes: { select: { id: true, recipeCode: true, version: true, status: true } },
        ...CONTENT_INCLUDE,
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    // The live rates, in the shape the edit form needs to prefill its price
    // tables - and to show what is charged today before anyone changes it.
    const pricing = await this.pricing.channelComparison(id);
    return { ...product, pricing };
  }

  async update(id: string, dto: UpdateProductDto, actorId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku && dto.sku !== product.sku) await this.assertSkuFree(dto.sku, id);

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    const publishing = dto.showOnStorefront ?? product.showOnStorefront;
    let slug: string | undefined;
    if (dto.slug && dto.slug !== product.slug) {
      slug = await this.uniqueSlug(dto.slug, id);
    } else if (publishing && !product.slug && !dto.slug) {
      // A product that becomes visible with no slug would have no clean URL.
      slug = await this.uniqueSlug(dto.name ?? product.name, id);
    }

    // The clients send `null` to mean "clear this optional field" (a blank
    // string is dropped in transit, so it cannot). That is only meaningful for
    // nullable columns - name, SKU and unit would fail in the database with a
    // 500, so refuse them here with a message that names the field.
    for (const required of ['name', 'sku', 'unit'] as const) {
      if ((dto as Record<string, unknown>)[required] === null) {
        throw new BadRequestException(`${required} is required and cannot be cleared`);
      }
    }

    // `slug` is destructured out rather than left in `scalars`: it changes only
    // through the uniqueness-checked path above, so a null or duplicate can
    // never reach the row and blank out a live storefront URL.
    const { variants, specifications, faqs, offers, pricing, slug: _slug, ...scalars } = dto;

    if (variants) {
      await this.assertVariantSkusFree(variants, dto.sku ?? product.sku, id);
      // A passed id must belong to THIS product. Without the check an id from
      // another product would be updated in place - rewriting its name, SKU
      // and images from a screen that has no business touching it.
      const owned = new Set(product.variants.map((v) => v.id));
      const foreign = variants.find((v) => v.id && !owned.has(v.id));
      if (foreign) {
        throw new BadRequestException(
          `Variant ${foreign.id} does not belong to this product and cannot be edited here.`,
        );
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Specs, FAQs and offers are pure content with nothing referencing them,
        // so replacing the list wholesale is both correct and the only way a
        // removed row actually disappears.
        if (specifications) {
          await tx.productSpecification.deleteMany({ where: { productId: id } });
          await tx.productSpecification.createMany({
            data: specifications.map((row, i) => ({ ...withOrder(row, i), productId: id })),
          });
        }
        if (faqs) {
          await tx.productFaq.deleteMany({ where: { productId: id } });
          await tx.productFaq.createMany({
            data: faqs.map((row, i) => ({ ...withOrder(row, i), productId: id })),
          });
        }
        if (offers) {
          await tx.productOffer.deleteMany({ where: { productId: id } });
          await tx.productOffer.createMany({
            data: offers.map((row, i) => ({ ...withOrder(row, i), productId: id })),
          });
        }

        // Variants are NOT replaced wholesale: each one owns dated price rules,
        // and delete-then-recreate would discard that price history on every
        // save of an unrelated field. Matched by id, so only a variant the user
        // actually removed loses its rules (via the FK cascade).
        const variantsForPricing: Array<{ id: string; pricing?: ChannelPricingDto }> = [];
        if (variants) {
          const keptIds = variants.map((v) => v.id).filter(Boolean) as string[];
          await tx.productVariant.deleteMany({
            where: { productId: id, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) },
          });

          for (const [index, variant] of variants.entries()) {
            const row = toVariantRow(variant, index);
            if (variant.id) {
              await tx.productVariant.update({ where: { id: variant.id }, data: row });
              variantsForPricing.push({ id: variant.id, pricing: variant.pricing });
            } else {
              const made = await tx.productVariant.create({ data: { ...row, productId: id } });
              variantsForPricing.push({ id: made.id, pricing: variant.pricing });
            }
          }
        }

        const updated = await tx.product.update({
          where: { id },
          data: { ...scalars, ...(slug ? { slug } : {}) },
          include: { category: CATEGORY_SELECT, ...CONTENT_INCLUDE },
        });

        await this.syncPrices(tx, id, pricing, variantsForPricing, actorId);
        return updated;
      },
      { timeout: 30_000 },
    );
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
            holdStatus: 'ACTIVE',
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
  create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload) {
    return this.productsService.create(dto, user.sub);
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
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: JwtPayload) {
    return this.productsService.update(id, dto, user.sub);
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
  imports: [PricingModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
