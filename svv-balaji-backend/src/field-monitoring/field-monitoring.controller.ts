import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FieldMonitoringService } from './field-monitoring.service';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';
import { AddFieldVisitDocumentDto } from './dto/add-field-visit-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('field-monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('field-visits')
export class FieldMonitoringController {
  constructor(private readonly fieldMonitoringService: FieldMonitoringService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  create(@Body() dto: CreateFieldVisitDto, @CurrentUser() user: JwtPayload) {
    return this.fieldMonitoringService.createVisit(dto, user.sub);
  }

  @Get()
  findAll(@Query('farmerId') farmerId?: string) {
    return this.fieldMonitoringService.findAll(farmerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fieldMonitoringService.findOne(id);
  }

  @Post(':id/documents')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  addDocument(@Param('id') id: string, @Body() dto: AddFieldVisitDocumentDto) {
    return this.fieldMonitoringService.addDocument(id, dto);
  }
}
