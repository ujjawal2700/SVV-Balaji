import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { StorefrontAuthService } from './storefront-auth.service';
import { StorefrontAccountsController, StorefrontAuthController } from './storefront-auth.controller';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';

@Module({
  imports: [
    // Separate PassportModule registration would collide with the staff one on
    // the default strategy name; both share the module, and the two strategies
    // ('jwt' and 'customer-jwt') stay distinguishable by name and guard.
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [StorefrontAuthController, StorefrontAccountsController],
  providers: [StorefrontAuthService, CustomerJwtStrategy],
  exports: [StorefrontAuthService],
})
export class StorefrontAuthModule {}
