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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TrainingService } from './training.service';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AddTrainingMaterialDto } from './dto/add-training-material.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('training-sessions')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  create(@Body() dto: CreateTrainingSessionDto, @CurrentUser() user: JwtPayload) {
    return this.trainingService.createSession(dto, user.sub);
  }

  @Get()
  findAll(@Query('branchId') branchId?: string) {
    return this.trainingService.findAll(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trainingService.findOne(id);
  }

  @Post(':id/attendance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  markAttendance(@Param('id') id: string, @Body() dto: MarkAttendanceDto) {
    return this.trainingService.markAttendance(id, dto);
  }

  @Post(':id/materials')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  addMaterial(@Param('id') id: string, @Body() dto: AddTrainingMaterialDto) {
    return this.trainingService.addMaterial(id, dto);
  }

  @Delete(':id/attendance/:farmerId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  @ApiOperation({ summary: 'Remove a farmer marked present by mistake' })
  removeAttendance(@Param('id') id: string, @Param('farmerId') farmerId: string) {
    return this.trainingService.removeAttendance(id, farmerId);
  }

  @Delete(':id/materials/:materialId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  removeMaterial(@Param('id') id: string, @Param('materialId') materialId: string) {
    return this.trainingService.removeMaterial(id, materialId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  update(@Param('id') id: string, @Body() dto: UpdateTrainingSessionDto) {
    return this.trainingService.updateSession(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
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
