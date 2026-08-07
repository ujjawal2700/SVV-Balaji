import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SeedDistributionService } from './seed-distribution.service';
import { CreateSeedDistributionDto } from './dto/create-seed-distribution.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('seed-distribution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('seed-distribution')
export class SeedDistributionController {
  constructor(private readonly seedDistributionService: SeedDistributionService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.AGRICULTURE_EXPERT)
  create(@Body() dto: CreateSeedDistributionDto, @CurrentUser() user: JwtPayload) {
    // FRD 10.1: "Authorized Agriculture Experts can distribute certified seeds."
    return this.seedDistributionService.create(dto, user.sub);
  }

  @Get()
  findAll(@Query('farmerId') farmerId?: string) {
    return this.seedDistributionService.findAll(farmerId);
  }
}
