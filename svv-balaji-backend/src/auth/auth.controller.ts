import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { VerifyTwoFactorLoginDto, EnableTwoFactorDto, DisableTwoFactorDto } from './dto/2fa.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns a short-lived accessToken and a rotating refreshToken. Clients should hold the ' +
      'access token in memory and call /auth/refresh when it expires.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify 2FA login challenge',
    description: 'Provide the short-lived twoFactorToken and the 6-digit TOTP (or recovery code) to complete sign-in.',
  })
  verifyTwoFactorLogin(@Body() dto: VerifyTwoFactorLoginDto) {
    return this.authService.verifyTwoFactorLogin(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new pair',
    description:
      'Refresh tokens rotate: the token presented here is invalidated and a new one issued. ' +
      'Presenting a token that has already been rotated away ends the session, so clients must ' +
      'serialise concurrent refreshes rather than firing several at once.',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'End the current session',
    description:
      'Discards the stored refresh token. The access token already issued remains valid until ' +
      'it expires - clients should discard it locally.',
  })
  logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'The signed-in user',
    description:
      'Role and branch of the current user. The admin panel calls this on boot to build ' +
      'role-based navigation.',
  })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update personal profile',
    description: 'Update full name, phone, or email. Email uniqueness is checked.',
  })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Change password',
    description: 'Update your password and invalidate all other sessions.',
  })
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Post('2fa/generate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Initiate 2FA Setup',
    description: 'Generates a temporary secret and QR code for authenticator apps.',
  })
  generateTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.authService.generateTwoFactorSetup(user.sub);
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Complete 2FA Setup',
    description: 'Verify the 6-digit code to enable 2FA and get recovery codes.',
  })
  enableTwoFactor(@CurrentUser() user: JwtPayload, @Body() dto: EnableTwoFactorDto) {
    return this.authService.enableTwoFactor(user.sub, dto);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Disable 2FA',
    description: 'Requires current password to disable two-factor authentication.',
  })
  disableTwoFactor(@CurrentUser() user: JwtPayload, @Body() dto: DisableTwoFactorDto) {
    return this.authService.disableTwoFactor(user.sub, dto);
  }
}
