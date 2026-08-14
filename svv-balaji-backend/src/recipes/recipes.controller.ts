import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecipeStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto } from './dto/recipe.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

export class SetRecipeStatusDto {
  @ApiProperty({ enum: RecipeStatus })
  @IsEnum(RecipeStatus)
  status: RecipeStatus;
}

@ApiTags('recipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Post()
  @RequirePermission('recipes.create')
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
  @RequirePermission('recipes.view')
  findAll(
    @Query('status') status?: RecipeStatus,
    @Query('productId') productId?: string,
    @Query('recipeCode') recipeCode?: string,
  ) {
    return this.recipesService.findAll({ status, productId, recipeCode });
  }

  @Get(':id')
  @RequirePermission('recipes.view')
  findOne(@Param('id') id: string) {
    return this.recipesService.findOne(id);
  }

  @Get('code/:recipeCode/versions')
  @RequirePermission('recipes.view')
  @ApiOperation({ summary: 'Version history for a recipe code (FRD 19.6)' })
  findVersions(@Param('recipeCode') recipeCode: string) {
    return this.recipesService.findVersions(recipeCode);
  }

  @Patch(':id/approve')
  @RequirePermission('recipes.approve')
  @ApiOperation({
    summary: 'Approve a recipe version (FRD 19.4)',
    description: 'Supersedes any previously approved version of the same code.',
  })
  approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.recipesService.approve(id, user.sub);
  }

  @Patch(':id/status')
  @RequirePermission('recipes.status')
  setStatus(@Param('id') id: string, @Body() dto: SetRecipeStatusDto) {
    return this.recipesService.setStatus(id, dto.status);
  }
}
