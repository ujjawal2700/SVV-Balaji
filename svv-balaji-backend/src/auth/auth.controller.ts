import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
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
}
