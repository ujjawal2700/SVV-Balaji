import { Body, Controller, Get, Param, ParseEnumPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PolicyAudience, PolicyType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { UpsertLegalPolicyDto } from './dto/upsert-legal-policy.dto';
import { LegalPoliciesService } from './legal-policies.service';

@ApiTags('legal-policies')
@Controller()
export class LegalPoliciesController {
  constructor(private readonly legalPoliciesService: LegalPoliciesService) {}

  // ------------------------------------------------------------ Public routes

  @Get('public/legal-policies/:audience/:type')
  @ApiOperation({ summary: 'Get active legal policy (Public)' })
  getPublicPolicy(
    @Param('audience', new ParseEnumPipe(PolicyAudience)) audience: PolicyAudience,
    @Param('type', new ParseEnumPipe(PolicyType)) type: PolicyType,
  ) {
    return this.legalPoliciesService.getPublicPolicy(audience, type);
  }

  @Get('public/legal-policies/by-audience/:audience')
  @ApiOperation({ summary: 'Get privacy policy & terms for an audience (Public)' })
  getPublicPoliciesByAudience(@Param('audience', new ParseEnumPipe(PolicyAudience)) audience: PolicyAudience) {
    return this.legalPoliciesService.getPublicPoliciesByAudience(audience);
  }

  @Get('public/legal-policies')
  @ApiOperation({ summary: 'Get public legal policies (Public)' })
  getPublicPoliciesQuery(
    @Query('audience') audience?: PolicyAudience,
    @Query('type') type?: PolicyType,
  ) {
    if (audience && type) {
      return this.legalPoliciesService.getPublicPolicy(audience, type);
    }
    if (audience) {
      return this.legalPoliciesService.getPublicPoliciesByAudience(audience);
    }
    return this.legalPoliciesService.getPublicPoliciesByAudience(PolicyAudience.RIDER);
  }

  // ------------------------------------------------------------ Admin routes

  @Get('legal-policies')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('legalPolicies.view')
  @ApiOperation({ summary: 'List all legal policies for admin' })
  getAllPoliciesAdmin() {
    return this.legalPoliciesService.getAllPoliciesAdmin();
  }

  @Put('legal-policies')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('legalPolicies.manage')
  @ApiOperation({ summary: 'Create or update legal policy (Admin) - served live to the storefront, retailer and rider apps' })
  upsertPolicy(@Body() dto: UpsertLegalPolicyDto, @CurrentUser() user: JwtPayload) {
    return this.legalPoliciesService.upsertPolicy(dto, user?.sub);
  }
}
