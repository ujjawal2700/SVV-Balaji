import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, PartialType } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { TestAddressDto, ZoneDto, ZonesService } from './zones.service';

class UpdateZoneDto extends PartialType(ZoneDto) {}

@ApiTags('delivery-zones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('delivery-zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  @RequirePermission('deliveryZones.view')
  @ApiOperation({ summary: 'All delivery zones with their serving outlet' })
  list() {
    return this.zones.list();
  }

  @Get(':id')
  @RequirePermission('deliveryZones.view')
  get(@Param('id') id: string) {
    return this.zones.get(id);
  }

  @Post()
  @RequirePermission('deliveryZones.manage')
  @ApiOperation({ summary: 'Create a zone (boundary / pincodes / radius, Quick settings, hours, outlet)' })
  create(@Body() dto: ZoneDto, @CurrentUser() user: JwtPayload) {
    return this.zones.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermission('deliveryZones.manage')
  update(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.zones.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('deliveryZones.manage')
  @ApiOperation({ summary: 'Delete a zone; a zone that served orders is deactivated instead' })
  remove(@Param('id') id: string) {
    return this.zones.remove(id);
  }

  @Post('test')
  @RequirePermission('deliveryZones.view')
  @ApiOperation({ summary: 'Which zone an address falls in, how it matched, and whether Quick is on/open' })
  test(@Body() dto: TestAddressDto) {
    return this.zones.test(dto);
  }
}
