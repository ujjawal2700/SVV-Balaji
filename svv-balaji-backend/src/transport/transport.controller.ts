import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransportService } from './transport.service';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';
import { QueryTransportDto } from './dto/query-transport.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('transports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('transports')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  @RequirePermission('transports.create')
  create(@Body() dto: CreateTransportDto, @CurrentUser() user: JwtPayload) {
    return this.transportService.create(dto, user.sub);
  }

  @Get()
  @RequirePermission('transports.view')
  findAll(@Query() query: QueryTransportDto) {
    return this.transportService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('transports.view')
  findOne(@Param('id') id: string) {
    return this.transportService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('transports.edit')
  update(@Param('id') id: string, @Body() dto: UpdateTransportDto) {
    return this.transportService.update(id, dto);
  }

  @Patch(':id/dispatch')
  @RequirePermission('transports.edit')
  dispatch(@Param('id') id: string) {
    return this.transportService.dispatch(id);
  }

  @Patch(':id/deliver')
  @RequirePermission('transports.edit')
  deliver(@Param('id') id: string, @Body('warehouseId') warehouseId: string) {
    return this.transportService.deliver(id, warehouseId);
  }

  @Patch(':id/cancel')
  @RequirePermission('transports.edit')
  cancel(@Param('id') id: string, @Body('remarks') remarks?: string) {
    return this.transportService.cancel(id, remarks);
  }
}
