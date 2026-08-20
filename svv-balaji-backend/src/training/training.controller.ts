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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TrainingService } from './training.service';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AddTrainingMaterialDto } from './dto/add-training-material.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('training-sessions')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post()
  @RequirePermission('training.create')
  create(@Body() dto: CreateTrainingSessionDto, @CurrentUser() user: JwtPayload) {
    return this.trainingService.createSession(dto, user.sub);
  }

  @Get()
  @RequirePermission('training.view')
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'conductedById', required: false, description: 'Sessions run by one executive.' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('conductedById') conductedById?: string,
  ) {
    return this.trainingService.findAll(user, branchId, conductedById);
  }

  @Get(':id')
  @RequirePermission('training.view')
  findOne(@Param('id') id: string) {
    return this.trainingService.findOne(id);
  }

  @Post(':id/attendance')
  @RequirePermission('training.edit')
  markAttendance(@Param('id') id: string, @Body() dto: MarkAttendanceDto) {
    return this.trainingService.markAttendance(id, dto);
  }

  @Post(':id/materials')
  @RequirePermission('training.edit')
  addMaterial(@Param('id') id: string, @Body() dto: AddTrainingMaterialDto) {
    return this.trainingService.addMaterial(id, dto);
  }

  @Delete(':id/attendance/:farmerId')
  @RequirePermission('training.edit')
  @ApiOperation({ summary: 'Remove a farmer marked present by mistake' })
  removeAttendance(@Param('id') id: string, @Param('farmerId') farmerId: string) {
    return this.trainingService.removeAttendance(id, farmerId);
  }

  @Delete(':id/materials/:materialId')
  @RequirePermission('training.edit')
  removeMaterial(@Param('id') id: string, @Param('materialId') materialId: string) {
    return this.trainingService.removeMaterial(id, materialId);
  }

  @Patch(':id')
  @RequirePermission('training.edit')
  update(@Param('id') id: string, @Body() dto: UpdateTrainingSessionDto) {
    return this.trainingService.updateSession(id, dto);
  }

  @Delete(':id')
  @RequirePermission('training.delete')
  @ApiOperation({
    summary: 'Delete a training session',
    description:
      'Blocked once attendance has been marked - that is the record of which farmers were ' +
      'trained. Materials are removed with the session.',
  })
  remove(@Param('id') id: string) {
    return this.trainingService.removeSession(id);
  }
}
