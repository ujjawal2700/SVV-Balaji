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
import { AgreementsService } from './agreements.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementStatusDto } from './dto/update-agreement-status.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('agreements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Post()
  @RequirePermission('agreements.create')
  create(@Body() dto: CreateAgreementDto) {
    return this.agreementsService.create(dto);
  }

  @Get()
  @RequirePermission('agreements.view')
  findAll(@CurrentUser() user: JwtPayload, @Query('farmerId') farmerId?: string) {
    return this.agreementsService.findAll(user, farmerId);
  }

  @Get(':id')
  @RequirePermission('agreements.view')
  findOne(@Param('id') id: string) {
    return this.agreementsService.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermission('agreements.edit')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAgreementStatusDto) {
    return this.agreementsService.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @RequirePermission('agreements.edit')
  @ApiOperation({
    summary: 'Correct an agreement',
    description:
      'Allowed until a harvest inspection is raised against it. After that the agreed rate is ' +
      'what collections fall back on and the quality standards are what the inspector judged ' +
      'against, so the terms are fixed.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateAgreementDto) {
    return this.agreementsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('agreements.delete')
  @ApiOperation({
    summary: 'Delete an agreement',
    description: 'Only while no harvest inspection references it.',
  })
  remove(@Param('id') id: string) {
    return this.agreementsService.remove(id);
  }
}
