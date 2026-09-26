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
import { BannerAudience, CustomerType, SalesChannel } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { StorefrontCatalogueModule } from '../storefront/storefront-catalogue.module';
import { StorefrontCatalogueService } from '../storefront/storefront-catalogue.service';

export class CreateHomeSectionDto {
  @ApiProperty({ description: 'Title of the home section e.g. "Best of the Basics"' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Optional subtitle e.g. "Farm-fresh flour, namkeen, spices & kitchen essentials"' })
  @IsOptional()
  @IsString()
  subtitle?: string;

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

  @ApiPropertyOptional({ description: 'Array of product UUIDs to show in this section' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}

export class UpdateHomeSectionDto extends PartialType(CreateHomeSectionDto) {}

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
        targetAudience: dto.targetAudience ?? BannerAudience.ALL,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        productIds: dto.productIds ?? [],
      },
    });
  }

  async findAll(includeInactive = false) {
    const sections = await this.prisma.homeSection.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return Promise.all(
      sections.map(async (sec) => {
        const products =
          sec.productIds.length > 0
            ? await this.prisma.product.findMany({
                where: { id: { in: sec.productIds } },
                select: {
                  id: true,
                  name: true,
                  images: true,
                  mrp: true,
                  packLabel: true,
                  category: { select: { name: true } },
                },
              })
            : [];
        return {
          ...sec,
          products,
        };
      }),
    );
  }

  async findOne(id: string) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');

    const products =
      section.productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: section.productIds } },
            select: {
              id: true,
              name: true,
              images: true,
              mrp: true,
              packLabel: true,
              category: { select: { name: true } },
            },
          })
        : [];

    return { ...section, products };
  }

  async update(id: string, dto: UpdateHomeSectionDto) {
    const section = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException('Home section not found');

    return this.prisma.homeSection.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.targetAudience !== undefined ? { targetAudience: dto.targetAudience } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
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

    return Promise.all(
      sections.map(async (sec) => {
        const products = await this.storefrontCatalogue.listProductsByIds(sec.productIds, {
          channel,
          customerType,
        });
        return {
          id: sec.id,
          title: sec.title,
          subtitle: sec.subtitle,
          displayOrder: sec.displayOrder,
          targetAudience: sec.targetAudience,
          products,
        };
      }),
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
    summary: 'Active homepage product sections configured by Super Admin',
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
