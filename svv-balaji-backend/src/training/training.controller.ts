import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TrainingService } from './training.service';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
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
}
