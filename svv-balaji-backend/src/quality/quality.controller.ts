import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InspectionStage, QualityResult } from '@prisma/client';
import { QualityService } from './quality.service';
import { CreateQualityInspectionDto } from './dto/quality.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('quality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quality-inspections')
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Post()
  @RequirePermission('quality.create')
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
  @RequirePermission('quality.view')
  findAll(@Query('stage') stage?: InspectionStage, @Query('result') result?: QualityResult) {
    return this.qualityService.findAll({ stage, result });
  }

  @Get(':id')
  @RequirePermission('quality.view')
  findOne(@Param('id') id: string) {
    return this.qualityService.findOne(id);
  }

  @Patch('release/:fgBatchId')
  @RequirePermission('quality.release')
  @ApiOperation({
    summary: 'Release a finished goods batch for stocking/dispatch (FRD 21.5)',
    description: 'Refuses unless the latest finished-goods inspection was a PASS.',
  })
  release(@Param('fgBatchId') fgBatchId: string) {
    return this.qualityService.releaseBatch(fgBatchId);
  }
}
