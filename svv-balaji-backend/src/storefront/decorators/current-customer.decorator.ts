import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CustomerJwtPayload } from '../strategies/customer-jwt.strategy';

export const CurrentCustomer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CustomerJwtPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
