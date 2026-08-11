import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InspectionStage, QualityResult, UserRole } from '@prisma/client';
import { QualityService } from './quality.service';
import { CreateQualityInspectionDto } from './dto/quality.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('quality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quality-inspections')
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.QA_MANAGER)
  @ApiOperation({
    summary: 'Record a quality inspection (FRD Section 21)',
    description:
      'A FAIL at RAW_MATERIAL stage marks the batch REJECTED so it cannot enter production. ' +
      'A FAIL at FINISHED_GOODS stage withdraws QA release so the batch cannot be stocked or dispatched.',
  })
  create(@Body() dto: CreateQualityInspectionDto, @CurrentUser() user: JwtPayload) {
    return this.qualityService.create(dto, user.sub);
  }

  @Get()
  findAll(@Query('stage') stage?: InspectionStage, @Query('result') result?: QualityResult) {
    return this.qualityService.findAll({ stage, result });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.qualityService.findOne(id);
  }

  @Patch('release/:fgBatchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.QA_MANAGER)
  @ApiOperation({
    summary: 'Release a finished goods batch for stocking/dispatch (FRD 21.5)',
    description: 'Refuses unless the latest finished-goods inspection was a PASS.',
  })
  release(@Param('fgBatchId') fgBatchId: string) {
    return this.qualityService.releaseBatch(fgBatchId);
  }
}
