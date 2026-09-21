import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecallService } from './recall.service';

describe('RecallService.setHold', () => {
  let batches: any[];
  let events: any[];
  let service: RecallService;

  beforeEach(() => {
    batches = [
      { id: 'b1', fgBatchNumber: 'FG-1', holdStatus: 'ACTIVE' },
      { id: 'b2', fgBatchNumber: 'FG-2', holdStatus: 'ON_HOLD' },
      { id: 'b3', fgBatchNumber: 'FG-3', holdStatus: 'RECALLED' },
    ];
    events = [];
    const tx = {
      finishedGoodsBatch: {
        findMany: jest.fn(async ({ where }) =>
          batches.filter((b) => where.fgBatchNumber.in.includes(b.fgBatchNumber)).map((b) => ({ ...b })), // snapshots, like Prisma
        ),
        update: jest.fn(async ({ where, data }) => Object.assign(batches.find((b) => b.id === where.id), data)),
      },
      batchHoldEvent: { create: jest.fn(async ({ data }) => events.push(data)) },
    };
    const prisma: any = { $transaction: async (fn: any) => fn(tx) };
    service = new RecallService(prisma);
  });

  it('freezes a batch and writes an audit event', async () => {
    const res = await service.setHold(['fg-1'], 'ON_HOLD' as any, 'Foreign particle complaint', 'u1');
    expect(res.changed).toEqual(['FG-1']);
    expect(batches[0].holdStatus).toBe('ON_HOLD');
    expect(batches[0].holdReason).toBe('Foreign particle complaint');
    expect(events).toEqual([
      expect.objectContaining({ fgBatchId: 'b1', fromStatus: 'ACTIVE', toStatus: 'ON_HOLD', performedById: 'u1' }),
    ]);
  });

  it('does not re-log a batch already in the requested status', async () => {
    const res = await service.setHold(['FG-2'], 'ON_HOLD' as any, 'still investigating', 'u1');
    expect(res.changed).toEqual([]);
    expect(res.unchanged).toEqual(['FG-2']);
    expect(events).toHaveLength(0);
  });

  it('release clears the reason', async () => {
    await service.setHold(['FG-2'], 'ACTIVE' as any, 'cleared by lab', 'u1');
    expect(batches[1].holdStatus).toBe('ACTIVE');
    expect(batches[1].holdReason).toBeNull();
  });

  it('treats a recall as final', async () => {
    await expect(service.setHold(['FG-3'], 'ACTIVE' as any, 'oops', 'u1')).rejects.toThrow(BadRequestException);
    await expect(service.setHold(['FG-3'], 'ON_HOLD' as any, 'oops', 'u1')).rejects.toThrow(/Recalled/);
  });

  it('rejects the whole request if any batch is unknown, changing nothing', async () => {
    await expect(service.setHold(['FG-1', 'FG-9'], 'RECALLED' as any, 'contamination', 'u1')).rejects.toThrow(
      NotFoundException,
    );
    expect(events).toHaveLength(0);
  });
});
