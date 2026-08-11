import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CustomerStatus, CustomerType, SalesChannel, UserRole } from '@prisma/client';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  UpdateCustomerStatusDto,
} from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.SALES_TEAM)
  @ApiOperation({
    summary: 'Register a customer in either sales channel (FRD Section 24)',
    description:
      'B2B customers (distributor, retailer, institutional) require a GSTIN and may hold credit ' +
      'terms. B2C consumers carry no GSTIN, no credit and pay up front. The channel is fixed at ' +
      'registration and cannot be changed afterwards.',
  })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'channel', enum: SalesChannel, required: false })
  @ApiQuery({ name: 'type', enum: CustomerType, required: false })
  @ApiQuery({ name: 'status', enum: CustomerStatus, required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Name, code, phone or GSTIN' })
  findAll(
    @Query('channel') channel?: SalesChannel,
    @Query('type') type?: CustomerType,
    @Query('status') status?: CustomerStatus,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll({ channel, type, status, branchId, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Get(':id/credit')
  @ApiOperation({
    summary: 'Credit limit, current exposure and headroom',
    description:
      'Exposure counts every order that is neither cancelled nor paid in full. This is the same ' +
      'figure the order module checks against before accepting a B2B order on credit terms.',
  })
  credit(@Param('id') id: string) {
    return this.customersService.creditPosition(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.SALES_TEAM)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Activate, deactivate or blacklist a customer' })
  setStatus(@Param('id') id: string, @Body() dto: UpdateCustomerStatusDto) {
    return this.customersService.setStatus(id, dto);
  }
}
