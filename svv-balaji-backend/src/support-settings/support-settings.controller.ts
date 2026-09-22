import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SupportSettingsService } from './support-settings.service';

@ApiTags('support-settings')
@Controller('support-settings')
export class SupportSettingsController {
  constructor(private readonly supportService: SupportSettingsService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Get current support settings (Super Admin)' })
  getSettings() {
    return this.supportService.getSettings();
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Update support settings & dynamic FAQs (Super Admin)' })
  updateSettings(@Body() body: any, @CurrentUser() user: JwtPayload) {
    return this.supportService.updateSettings(body, user?.sub);
  }

  @Get('public')
  @ApiOperation({ summary: 'Public Storefront Help & Support details & FAQs' })
  getStorefrontSupport(@Query('channel') channel?: string) {
    return this.supportService.getStorefrontSupport(channel);
  }
}
