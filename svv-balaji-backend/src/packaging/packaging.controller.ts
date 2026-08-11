import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PackagingService } from './packaging.service';
import { CreateFinishedGoodsBatchDto, StockFinishedGoodsDto } from './dto/packaging.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('packaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PackagingController {
  constructor(private readonly packagingService: PackagingService) {}

  @Post('finished-goods')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({
    summary: 'Package a completed production run (FRD Section 22)',
    description:
      'Generates an FG-YYYYMMDD-NNN batch and stores its QR payload. Refuses to pack more than ' +
      'the production run actually yielded.',
  })
  create(@Body() dto: CreateFinishedGoodsBatchDto, @CurrentUser() user: JwtPayload) {
    return this.packagingService.createFinishedGoodsBatch(dto, user.sub);
  }

  @Get('finished-goods')
  findAll(
    @Query('productionBatchId') productionBatchId?: string,
    @Query('qaReleased') qaReleased?: string,
  ) {
    return this.packagingService.findAll({
      productionBatchId,
      qaReleased: qaReleased === undefined ? undefined : qaReleased === 'true',
    });
  }

  @Get('finished-goods/:id/label')
  @ApiOperation({ summary: 'Print-ready label data including QR + barcode (FRD 22.2)' })
  label(@Param('id') id: string) {
    return this.packagingService.label(id);
  }

  @Get('finished-goods/:id/qr.svg')
  @Header('Content-Type', 'image/svg+xml')
  qr(@Param('id') id: string) {
    return this.packagingService.qrSvg(id);
  }

  @Post('finished-goods/:id/stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.PRODUCTION_MANAGER)
  @ApiOperation({ summary: 'Move packed goods into the finished goods warehouse (FRD 23)' })
  stockIn(@Param('id') id: string, @Body() dto: StockFinishedGoodsDto) {
    return this.packagingService.stockIn(id, dto);
  }

  @Get('finished-goods-stock')
  findStock(@Query('warehouseId') warehouseId?: string) {
    return this.packagingService.findStock(warehouseId);
  }

  @Get('trace/:fgBatchNumber')
  @ApiOperation({
    summary: 'Full farm-to-fork trace for a finished pack',
    description:
      'Walks finished batch -> production run -> every raw material batch consumed -> the farmer ' +
      'and farm behind each. This is what a consumer QR scan resolves to.',
  })
  trace(@Param('fgBatchNumber') fgBatchNumber: string) {
    return this.packagingService.traceFinishedGoods(fgBatchNumber);
  }
}
