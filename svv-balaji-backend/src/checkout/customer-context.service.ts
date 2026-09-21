import { ForbiddenException, Injectable } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A storefront session belongs to a `CustomerAccount` (login); everything
 * commercial (orders, addresses, points) belongs to the `Customer` behind it.
 * A retailer still waiting for approval has an account but no Customer yet, so
 * they can browse but not buy.
 */
@Injectable()
export class CustomerContextService {
  constructor(private readonly prisma: PrismaService) {}

  async forAccount(accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { id: accountId },
      include: { customer: true },
    });
    if (!account?.customer) {
      throw new ForbiddenException('Your account is not approved for ordering yet');
    }
    if (account.customer.status !== CustomerStatus.ACTIVE) {
      throw new ForbiddenException('This account cannot place orders right now');
    }
    return account.customer;
  }
}
