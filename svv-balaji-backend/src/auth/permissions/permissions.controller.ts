import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../decorators/current-user.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { JwtPayload } from '../strategies/jwt.strategy';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { PermissionsService } from './permissions.service';
import { ASSIGNABLE_ROLES, PERMISSION_GROUPS, defaultPermissionsFor } from './registry';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @RequirePermission('rolePermissions.view')
  @ApiOperation({
    summary: 'The permission catalogue',
    description:
      'Every permission this system defines, grouped by the page it governs, with the label ' +
      'and help text the admin screen renders and the roles each one defaults to. This list ' +
      'comes from the application, not the database - it is what CAN be granted.',
  })
  registry() {
    return {
      groups: PERMISSION_GROUPS,
      assignableRoles: ASSIGNABLE_ROLES,
      defaults: Object.fromEntries(
        ASSIGNABLE_ROLES.map((role) => [role, defaultPermissionsFor(role)]),
      ),
    };
  }

  @Get('matrix')
  @RequirePermission('rolePermissions.view')
  @ApiOperation({
    summary: 'What each role currently holds',
    description:
      'The grants as they stand in the database, plus how many users hold each role - so the ' +
      'screen can say how many people a change will affect before it is made.',
  })
  async matrix() {
    const [matrix, userCounts] = await Promise.all([
      this.permissions.matrix(),
      this.permissions.userCounts(),
    ]);

    return { matrix, userCounts };
  }

  @Put('roles/:role')
  @RequirePermission('rolePermissions.manage')
  @ApiParam({ name: 'role', enum: ASSIGNABLE_ROLES })
  @ApiOperation({
    summary: "Replace a role's permissions",
    description:
      'Send the complete set, not a delta. Takes effect on the next request every affected ' +
      'user makes - permissions are not carried in the access token, precisely so that ' +
      'revoking one does not wait for a token to expire.',
  })
  async setForRole(
    @Param('role') role: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    const permissions = await this.permissions.setForRole(
      this.parseRole(role),
      dto.permissions,
      actor.sub,
    );

    return { role, permissions };
  }

  @Post('roles/:role/reset')
  @RequirePermission('rolePermissions.manage')
  @ApiParam({ name: 'role', enum: ASSIGNABLE_ROLES })
  @ApiOperation({
    summary: 'Restore a role to its defaults',
    description:
      'The defaults are the access this role had on 15 August 2026, before permissions became ' +
      'editable. Useful as a way back when a change has locked people out of something.',
  })
  async reset(@Param('role') role: string, @CurrentUser() actor: JwtPayload) {
    const permissions = await this.permissions.resetRole(this.parseRole(role), actor.sub);
    return { role, permissions };
  }

  /**
   * Validates the path segment before it reaches Prisma. Without this an
   * unknown role produces a Prisma enum error, which is a 500 describing a
   * database type to someone who mistyped a URL.
   */
  private parseRole(value: string): UserRole {
    const role = value as UserRole;
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException(
        `"${value}" is not a role. Expected one of: ${Object.values(UserRole).join(', ')}.`,
      );
    }
    return role;
  }
}
