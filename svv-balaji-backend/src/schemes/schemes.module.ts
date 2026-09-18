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
import { BannerAudience } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

export class CreateSchemeDto {
  @ApiProperty({ description: 'Small eyebrow label, e.g. "LIMITED TIME" or "BULK DISCOUNT".' })
  @IsString()
  tag: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  subtitle: string;

  @ApiProperty()
  @IsString()
  ctaText: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ctaLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badgeColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badgeTextColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buttonColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buttonTextColor?: string;

  @ApiPropertyOptional({ enum: BannerAudience })
  @IsOptional()
  @IsEnum(BannerAudience)
  targetAudience?: BannerAudience;

  @ApiPropertyOptional({ description: 'Row/position on the homepage - lower shows first.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSchemeDto extends PartialType(CreateSchemeDto) {}

@Injectable()
export class SchemesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSchemeDto) {
    return this.prisma.scheme.create({
      data: {
        tag: dto.tag,
        title: dto.title,
        subtitle: dto.subtitle,
        ctaText: dto.ctaText,
        ctaLink: dto.ctaLink ?? '/products/atta-flour',
        backgroundColor: dto.backgroundColor ?? '#fce3cd',
        textColor: dto.textColor ?? '#452b0d',
        badgeColor: dto.badgeColor ?? '#965a0b',
        badgeTextColor: dto.badgeTextColor ?? '#ffffff',
        buttonColor: dto.buttonColor ?? '#8a4b08',
        buttonTextColor: dto.buttonTextColor ?? '#ffffff',
        targetAudience: dto.targetAudience ?? BannerAudience.ALL,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  findAll(includeInactive = false) {
    return this.prisma.scheme.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const scheme = await this.prisma.scheme.findUnique({ where: { id } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    return scheme;
  }

  async update(id: string, dto: UpdateSchemeDto) {
    const scheme = await this.prisma.scheme.findUnique({ where: { id } });
    if (!scheme) throw new NotFoundException('Scheme not found');

    return this.prisma.scheme.update({
      where: { id },
      data: {
        tag: dto.tag,
        title: dto.title,
        subtitle: dto.subtitle,
        ctaText: dto.ctaText,
        ctaLink: dto.ctaLink,
        backgroundColor: dto.backgroundColor,
        textColor: dto.textColor,
        badgeColor: dto.badgeColor,
        badgeTextColor: dto.badgeTextColor,
        buttonColor: dto.buttonColor,
        buttonTextColor: dto.buttonTextColor,
        targetAudience: dto.targetAudience,
        displayOrder: dto.displayOrder,
        isActive: dto.isActive,
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    const scheme = await this.prisma.scheme.findUnique({ where: { id } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    if (scheme.isActive === isActive) return scheme;
    return this.prisma.scheme.update({ where: { id }, data: { isActive } });
  }

  async remove(id: string) {
    const scheme = await this.prisma.scheme.findUnique({ where: { id } });
    if (!scheme) throw new NotFoundException('Scheme not found');
    await this.prisma.scheme.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * What the storefront renders: active, either targeted at everyone or the
   * caller's own channel. An empty result is a deliberate state, not a
   * loading gap - Super Admin deactivating (or deleting) every scheme is how
   * the whole "Today's Schemes" section on the homepage gets hidden, and the
   * customer app renders nothing rather than substituting placeholder content.
   */
  listPublic(audience?: BannerAudience) {
    return this.prisma.scheme.findMany({
      where: {
        isActive: true,
        targetAudience: audience ? { in: [BannerAudience.ALL, audience] } : undefined,
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
}

@ApiTags('schemes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('schemes')
export class SchemesController {
  constructor(private readonly schemesService: SchemesService) {}

  @Post()
  @RequirePermission('schemes.create')
  create(@Body() dto: CreateSchemeDto) {
    return this.schemesService.create(dto);
  }

  @Get()
  @RequirePermission('schemes.view')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.schemesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermission('schemes.view')
  findOne(@Param('id') id: string) {
    return this.schemesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('schemes.edit')
  update(@Param('id') id: string, @Body() dto: UpdateSchemeDto) {
    return this.schemesService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('schemes.edit')
  @ApiOperation({
    summary: 'Publish or unpublish a scheme',
    description:
      'Unpublishing every scheme removes the whole "Today\'s Schemes & Offers" section from the ' +
      'homepage immediately, rather than leaving it empty.',
  })
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.schemesService.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @RequirePermission('schemes.delete')
  remove(@Param('id') id: string) {
    return this.schemesService.remove(id);
  }
}

/**
 * Deliberately unguarded, same reasoning as the other storefront read
 * surfaces (banners, categories, catalogue).
 */
@ApiTags('storefront-schemes')
@Controller('storefront/schemes')
export class StorefrontSchemesController {
  constructor(private readonly schemesService: SchemesService) {}

  @Get()
  @ApiOperation({
    summary: 'Active homepage schemes',
    description: 'Empty means Super Admin has hidden the section - render nothing, not a fallback.',
  })
  @ApiQuery({ name: 'audience', enum: BannerAudience, required: false })
  list(@Query('audience') audience?: BannerAudience) {
    return this.schemesService.listPublic(audience);
  }
}

@Module({
  controllers: [SchemesController, StorefrontSchemesController],
  providers: [SchemesService],
  exports: [SchemesService],
})
export class SchemesModule {}
