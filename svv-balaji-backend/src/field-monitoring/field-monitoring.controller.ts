import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FieldMonitoringService } from './field-monitoring.service';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';
import { AddFieldVisitDocumentDto } from './dto/add-field-visit-document.dto';
import { UpdateFieldVisitDto } from './dto/update-field-visit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('field-monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('field-visits')
export class FieldMonitoringController {
  constructor(private readonly fieldMonitoringService: FieldMonitoringService) {}

  @Post()
  @RequirePermission('fieldVisits.create')
  create(@Body() dto: CreateFieldVisitDto, @CurrentUser() user: JwtPayload) {
    return this.fieldMonitoringService.createVisit(dto, user.sub);
  }

  @Get()
  @RequirePermission('fieldVisits.view')
  findAll(@Query('farmerId') farmerId?: string) {
    return this.fieldMonitoringService.findAll(farmerId);
  }

  @Get(':id')
  @RequirePermission('fieldVisits.view')
  findOne(@Param('id') id: string) {
    return this.fieldMonitoringService.findOne(id);
  }

  @Post(':id/documents')
  @RequirePermission('fieldVisits.edit')
  addDocument(@Param('id') id: string, @Body() dto: AddFieldVisitDocumentDto) {
    return this.fieldMonitoringService.addDocument(id, dto);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermission('fieldVisits.edit')
  removeDocument(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.fieldMonitoringService.removeDocument(id, documentId);
  }

  @Patch(':id')
  @RequirePermission('fieldVisits.edit')
  update(@Param('id') id: string, @Body() dto: UpdateFieldVisitDto) {
    return this.fieldMonitoringService.updateVisit(id, dto);
  }

  @Delete(':id')
  @RequirePermission('fieldVisits.delete')
  remove(@Param('id') id: string) {
    return this.fieldMonitoringService.removeVisit(id);
  }
}
