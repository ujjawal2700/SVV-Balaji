import { PushApp, PushRecipientKind } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService device registration', () => {
  const tx = {
    pushDevice: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const fcm = { enabled: true };
  const service = new NotificationsService(prisma as never, fcm as never);

  beforeEach(() => jest.clearAllMocks());

  it('upserts the customer FCM token with its account and live session', async () => {
    const token = 'customer-fcm-token-that-is-long-enough';

    await expect(
      service.registerDevice(
        { kind: PushRecipientKind.CUSTOMER, id: 'account-1', sessionId: 'session-1' },
        { app: PushApp.CUSTOMER, token },
        'Test browser',
      ),
    ).resolves.toEqual({ registered: true, pushEnabled: true });

    expect(tx.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: {
        kind: PushRecipientKind.CUSTOMER,
        app: PushApp.CUSTOMER,
        sessionId: 'session-1',
        token: { not: token },
      },
    });
    expect(tx.pushDevice.upsert).toHaveBeenCalledWith({
      where: { token },
      create: expect.objectContaining({
        token,
        kind: PushRecipientKind.CUSTOMER,
        app: PushApp.CUSTOMER,
        customerAccountId: 'account-1',
        sessionId: 'session-1',
      }),
      update: expect.objectContaining({
        kind: PushRecipientKind.CUSTOMER,
        customerAccountId: 'account-1',
        sessionId: 'session-1',
      }),
    });
  });

  it('rejects a customer token submitted for another app', async () => {
    await expect(
      service.registerDevice(
        { kind: PushRecipientKind.CUSTOMER, id: 'account-1', sessionId: 'session-1' },
        { app: PushApp.ADMIN, token: 'customer-fcm-token-that-is-long-enough' },
      ),
    ).rejects.toThrow('cannot register an ADMIN device');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
