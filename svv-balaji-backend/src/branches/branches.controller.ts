import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { branchScopeFor } from '../common/branch-scope';
import { BranchPerformanceService } from './branch-performance.service';
import { AssignBranchManagerDto } from './dto/assign-branch-manager.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly branchPerformance: BranchPerformanceService,
  ) {}

  @Post()
  @RequirePermission('branches.create')
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get()
  @RequirePermission('branches.view')
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    // Open to any authenticated role - every module needs branch lookups.
    return this.branchesService.findAll(activeOnly === 'true');
  }

  /**
   * FRD 6.5 - all branches side by side.
   *
   * Declared before `:id/performance` because Nest matches routes in
   * declaration order: registered after it, `performance` would be captured as
   * an `:id` and this would never be reached.
   */
  @Get('performance')
  @RequirePermission('branches.performance')
  @ApiOperation({
    summary: 'Consolidated performance across every active branch (FRD 6.5)',
    description:
      'Super Admin only. Anyone scoped to a branch is redirected to their own - a consolidated ' +
      'view is the one thing branch scoping cannot allow through.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date. Defaults to 30 days ago.' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date. Defaults to today.' })
  consolidated(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = branchScopeFor(user);
    const range: [Date | undefined, Date | undefined] = [
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    ];

    // A branch user asking for "all branches" gets their own, as a one-element
    // list. Refusing would be pedantic; widening would defeat the scoping.
    return scope
      ? this.branchPerformance.forBranch(scope, ...range).then((one) => [one])
      : this.branchPerformance.consolidated(...range);
  }

  @Get(':id')
  @RequirePermission('branches.view')
  findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('branches.edit')
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('branches.edit')
  @ApiOperation({
    summary: 'Deactivate or reactivate a branch',
    description:
      'The ordinary way a branch leaves service. Refused while active users are still assigned to it.',
  })
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.branchesService.setActive(id, dto.isActive);
  }


  @Get(':id/performance')
  @RequirePermission('branches.performance')
  @ApiOperation({
    summary: 'One branch\'s performance and reports (FRD 6.4/6.5)',
    description:
      'Procurement volume, production, sales, inventory utilisation and operational efficiency ' +
      'over a period. Efficiency is a defined composite - production yield, inspection approval ' +
      'rate and on-time delivery - each also returned separately so a poor score can be ' +
      'explained rather than merely reported.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date. Defaults to 30 days ago.' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date. Defaults to today.' })
  performance(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = branchScopeFor(user);
    if (scope && scope !== id) {
      throw new ForbiddenException('You can only view your own branch\'s performance.');
    }

    return this.branchPerformance.forBranch(
      id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Patch(':id/manager')
  @RequirePermission('branches.assignManager')
  @ApiOperation({
    summary: 'Assign or vacate this branch\'s manager (FRD 6.2)',
    description:
      'The user must hold the BRANCH_MANAGER role, be active, and already work at this branch - ' +
      'otherwise the record would name someone accountable for a branch they have no authority ' +
      'over or cannot see. Pass null to vacate.',
  })
  assignManager(@Param('id') id: string, @Body() dto: AssignBranchManagerDto) {
    return this.branchesService.assignManager(id, dto.managerId ?? null);
  }

  @Delete(':id')
  @RequirePermission('branches.delete')
  @ApiOperation({
    summary: 'Permanently delete a branch',
    description:
      'Only possible while nothing references it - typically a branch created by mistake. ' +
      'Returns 409 listing what is blocking otherwise.',
  })
  remove(@Param('id') id: string) {
    return this.branchesService.remove(id);
  }
}
