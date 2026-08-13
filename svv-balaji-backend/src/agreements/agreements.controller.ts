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
import { AgreementsService } from './agreements.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementStatusDto } from './dto/update-agreement-status.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('agreements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER)
  create(@Body() dto: CreateAgreementDto) {
    return this.agreementsService.create(dto);
  }

  @Get()
  findAll(@Query('farmerId') farmerId?: string) {
    return this.agreementsService.findAll(farmerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agreementsService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAgreementStatusDto) {
    return this.agreementsService.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER)
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
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete an agreement',
    description: 'Only while no harvest inspection references it.',
  })
  remove(@Param('id') id: string) {
    return this.agreementsService.remove(id);
  }
}
