import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecipeStatus, UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto } from './dto/recipe.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

export class SetRecipeStatusDto {
  @ApiProperty({ enum: RecipeStatus })
  @IsEnum(RecipeStatus)
  status: RecipeStatus;
}

@ApiTags('recipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a recipe (Super Admin only, FRD 19.1)',
    description:
      'Creates version 1, or a new version if recipeCode already exists. Approved recipes are ' +
      'never edited in place - production batches pin the version they used.',
  })
  create(@Body() dto: CreateRecipeDto, @CurrentUser() user: JwtPayload) {
    return this.recipesService.create(dto, user.sub);
  }

  @Get()
  findAll(
    @Query('status') status?: RecipeStatus,
    @Query('productId') productId?: string,
    @Query('recipeCode') recipeCode?: string,
  ) {
    return this.recipesService.findAll({ status, productId, recipeCode });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recipesService.findOne(id);
  }

  @Get('code/:recipeCode/versions')
  @ApiOperation({ summary: 'Version history for a recipe code (FRD 19.6)' })
  findVersions(@Param('recipeCode') recipeCode: string) {
    return this.recipesService.findVersions(recipeCode);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Approve a recipe version (FRD 19.4)',
    description: 'Supersedes any previously approved version of the same code.',
  })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.recipesService.approve(id, user.sub);
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  setStatus(@Param('id') id: string, @Body() dto: SetRecipeStatusDto) {
    return this.recipesService.setStatus(id, dto.status);
  }
}
