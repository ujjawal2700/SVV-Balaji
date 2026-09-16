import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { VerifySupplierDto } from './dto/verify-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermission('suppliers.create')
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: JwtPayload) {
    return this.suppliersService.create(dto, user?.sub);
  }

  @Get()
  @RequirePermission('suppliers.view')
  findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('suppliers.view')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id/verify')
  @RequirePermission('suppliers.approve')
  verify(
    @Param('id') id: string,
    @Body() dto: VerifySupplierDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.verify(id, dto, user.sub);
  }

  @Patch(':id/status')
  @RequirePermission('suppliers.status')
  updateStatus(@Param('id') id: string, @Body('status') status: import('@prisma/client').SupplierStatus) {
    return this.suppliersService.updateStatus(id, status);
  }

  @Patch(':id')
  @RequirePermission('suppliers.edit')
  @ApiOperation({
    summary: 'Correct supplier details',
  })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('suppliers.delete')
  @ApiOperation({
    summary: 'Permanently delete an unapproved supplier',
  })
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }
}
