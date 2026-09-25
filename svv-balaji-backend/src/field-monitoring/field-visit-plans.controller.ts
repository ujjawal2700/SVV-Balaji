import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FieldVisitPlansService } from './field-visit-plans.service';
import {
  CancelFieldVisitPlanDto,
  CreateFieldVisitPlanDto,
  QueryFieldVisitPlanDto,
  UpdateFieldVisitPlanDto,
} from './dto/field-visit-plan.dto';

/**
 * FRD 12.1 planned visits.
 *
 * Governed by the existing field-visit permissions rather than new keys: a role
 * that may record a visit may plan one, and no Super Admin has to discover and
 * grant a new switch before the feature works.
 */
@ApiTags('field-monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('field-visit-plans')
export class FieldVisitPlansController {
  constructor(private readonly plans: FieldVisitPlansService) {}

  @Post()
  @RequirePermission('fieldVisits.create')
  @ApiOperation({ summary: 'Plan a field visit (FRD 12.1)' })
  create(@Body() dto: CreateFieldVisitPlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.create(dto, user);
  }

  @Get()
  @RequirePermission('fieldVisits.view')
  findAll(@Query() query: QueryFieldVisitPlanDto, @CurrentUser() user: JwtPayload) {
    return this.plans.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission('fieldVisits.view')
  findOne(@Param('id') id: string) {
    return this.plans.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('fieldVisits.edit')
  @ApiOperation({ summary: 'Reschedule or reassign a planned visit (PLANNED only)' })
  update(@Param('id') id: string, @Body() dto: UpdateFieldVisitPlanDto) {
    return this.plans.update(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('fieldVisits.edit')
  cancel(@Param('id') id: string, @Body() dto: CancelFieldVisitPlanDto) {
    return this.plans.cancel(id, dto);
  }

  @Delete(':id')
  @RequirePermission('fieldVisits.delete')
  @ApiOperation({ summary: 'Delete a planned or cancelled visit. Completed plans are kept.' })
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
