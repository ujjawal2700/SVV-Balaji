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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SeedDistributionService } from './seed-distribution.service';
import { CreateSeedDistributionDto } from './dto/create-seed-distribution.dto';
import { UpdateSeedDistributionDto } from './dto/update-seed-distribution.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('seed-distribution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('seed-distribution')
export class SeedDistributionController {
  constructor(private readonly seedDistributionService: SeedDistributionService) {}

  @Post()
  @RequirePermission('seed.create')
  create(@Body() dto: CreateSeedDistributionDto, @CurrentUser() user: JwtPayload) {
    // FRD 10.1: "Authorized Agriculture Experts can distribute certified seeds."
    return this.seedDistributionService.create(dto, user.sub);
  }

  @Get()
  @RequirePermission('seed.view')
  @ApiQuery({ name: 'farmerId', required: false })
  @ApiQuery({ name: 'distributedById', required: false, description: 'Handouts made by one executive.' })
  findAll(
    @Query('farmerId') farmerId?: string,
    @Query('distributedById') distributedById?: string,
  ) {
    return this.seedDistributionService.findAll(farmerId, distributedById);
  }

  @Get(':id')
  @RequirePermission('seed.view')
  findOne(@Param('id') id: string) {
    return this.seedDistributionService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('seed.edit')
  update(@Param('id') id: string, @Body() dto: UpdateSeedDistributionDto) {
    return this.seedDistributionService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('seed.delete')
  remove(@Param('id') id: string) {
    return this.seedDistributionService.remove(id);
  }
}
