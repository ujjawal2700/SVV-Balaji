import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductionType, RecipeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecipeDto } from './dto/recipe.dto';

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a recipe at version 1, or a new version if the code already exists.
   * Recipes are never edited in place once approved (FRD 19.6) - production
   * batches pin the version they used, so mutating an approved recipe would
   * silently rewrite the history of everything already made from it.
   */
  async create(dto: CreateRecipeDto, createdById: string) {
    this.validateIngredients(dto);

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const latest = await this.prisma.recipe.findFirst({
      where: { recipeCode: dto.recipeCode },
      orderBy: { version: 'desc' },
    });
    const version = latest ? latest.version + 1 : 1;

    return this.prisma.recipe.create({
      data: {
        recipeCode: dto.recipeCode,
        version,
        productId: dto.productId,
        name: dto.name,
        category: dto.category,
        description: dto.description,
        productionType: dto.productionType,
        mixingRatio: dto.mixingRatio,
        processingSequence: dto.processingSequence,
        grindingInstructions: dto.grindingInstructions,
        roastingInstructions: dto.roastingInstructions,
        oilExtractionProcess: dto.oilExtractionProcess,
        packagingInstructions: dto.packagingInstructions,
        batchYieldQuantity: dto.batchYieldQuantity,
        unit: dto.unit ?? 'KG',
        createdById,
        ingredients: {
          create: dto.ingredients.map((i) => ({
            cropName: i.cropName,
            quantity: i.quantity,
            unit: i.unit ?? 'KG',
            percentage: i.percentage,
          })),
        },
      },
      include: { ingredients: true, product: { select: { id: true, name: true, sku: true } } },
    });
  }

  /**
   * FRD 19.2 - a single-grain recipe has exactly one ingredient; a multigrain
   * blend needs percentages that add up to 100, otherwise the ratio is
   * meaningless and the blend is unreproducible.
   */
  private validateIngredients(dto: CreateRecipeDto) {
    if (dto.productionType === ProductionType.SINGLE_GRAIN) {
      if (dto.ingredients.length !== 1) {
        throw new BadRequestException(
          'A SINGLE_GRAIN recipe must have exactly one ingredient',
        );
      }
      return;
    }

    if (dto.ingredients.length < 2) {
      throw new BadRequestException('A MULTI_GRAIN recipe needs at least two ingredients');
    }

    const missing = dto.ingredients.filter((i) => i.percentage === undefined || i.percentage === null);
    if (missing.length) {
      throw new BadRequestException(
        'Every MULTI_GRAIN ingredient needs a percentage so the blend ratio is reproducible',
      );
    }

    const total = dto.ingredients.reduce((sum, i) => sum + Number(i.percentage), 0);
    // Allow a small rounding tolerance on percentages like 33.33.
    if (Math.abs(total - 100) > 0.05) {
      throw new BadRequestException(
        `MULTI_GRAIN ingredient percentages must total 100 (got ${total.toFixed(2)})`,
      );
    }

    const dupes = dto.ingredients
      .map((i) => i.cropName.trim().toLowerCase())
      .filter((c, idx, arr) => arr.indexOf(c) !== idx);
    if (dupes.length) {
      throw new BadRequestException(`Duplicate ingredient in recipe: ${dupes[0]}`);
    }
  }

  findAll(filters: { status?: RecipeStatus; productId?: string; recipeCode?: string }) {
    return this.prisma.recipe.findMany({
      where: filters,
      orderBy: [{ recipeCode: 'asc' }, { version: 'desc' }],
      include: {
        ingredients: true,
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findOne(id: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: true,
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    return recipe;
  }

  /** FRD 19.6 - all versions of a code, newest first. */
  findVersions(recipeCode: string) {
    return this.prisma.recipe.findMany({
      where: { recipeCode },
      orderBy: { version: 'desc' },
      include: { ingredients: true },
    });
  }

  /**
   * FRD 19.4 - approval gate. Approving a version supersedes any previously
   * approved version of the same code, so exactly one is live at a time.
   */
  async approve(id: string, approvedById: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) throw new NotFoundException('Recipe not found');

    if (recipe.status === RecipeStatus.APPROVED) {
      throw new BadRequestException('Recipe is already approved');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.recipe.updateMany({
        where: { recipeCode: recipe.recipeCode, status: RecipeStatus.APPROVED },
        data: { status: RecipeStatus.INACTIVE },
      });

      return tx.recipe.update({
        where: { id },
        data: {
          status: RecipeStatus.APPROVED,
          approvedById,
          approvedAt: new Date(),
        },
        include: { ingredients: true },
      });
    });
  }

  async setStatus(id: string, status: RecipeStatus) {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe) throw new NotFoundException('Recipe not found');
    if (status === RecipeStatus.APPROVED) {
      throw new BadRequestException('Use the /approve endpoint to approve a recipe');
    }
    return this.prisma.recipe.update({ where: { id }, data: { status } });
  }
}
