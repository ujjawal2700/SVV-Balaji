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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { SetActiveDto } from '../common/dto/set-active.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

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
