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
import { UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import {
  ResetUserPasswordDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission('users.create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(dto, user);
  }

  @Get()
  @RequirePermission('users.view')
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('branchId') branchId?: string,
    @Query('status') status?: UserStatus,
  ) {
    return this.usersService.findAll(user, { branchId, status });
  }

  @Get(':id')
  @RequirePermission('users.view')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('users.edit')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.usersService.update(id, dto, actor.sub, actor);
  }

  @Patch(':id/status')
  @RequirePermission('users.edit')
  @ApiOperation({
    summary: 'Activate, deactivate or suspend a user',
    description:
      'Deactivating clears the refresh token, so any session the user currently holds ' +
      'stops working rather than surviving until the token expires.',
  })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.usersService.setStatus(id, dto.status, actor.sub);
  }

  @Patch(':id/password')
  @RequirePermission('users.edit')
  @ApiOperation({
    summary: 'Administratively reset a password',
    description: 'Ends every session the user currently holds.',
  })
  resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    return this.usersService.resetPassword(id, dto);
  }

  @Delete(':id')
  @RequirePermission('users.delete')
  @ApiOperation({
    summary: 'Permanently delete a user',
    description:
      'Only possible for an account that has never been used. Any recorded action - a ' +
      'verification, a collection, a stock movement - blocks it, because those references ' +
      'are the audit trail. Deactivate instead.',
  })
  remove(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.usersService.remove(id, actor.sub);
  }
}
