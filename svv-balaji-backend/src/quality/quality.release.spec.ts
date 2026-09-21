import { BadRequestException } from '@nestjs/common';
import { QualityService } from './quality.service';

describe('QualityService.releaseBatch - auto-inward', () => {
  const batch = (over: Record<string, unknown> = {}) => ({
    id: 'fg1',
    fgBatchNumber: 'FG-1',
    packCount: 16,
    holdStatus: 'ACTIVE',
    productionBatch: { warehouseId: 'wh1', branchId: 'b1' },
    qualityInspections: [{ result: 'PASS' }],
    ...over,
  });

  function build(b: unknown, existingInward: unknown = null) {
    const tx = {
      finishedGoodsBatch: { update: jest.fn().mockResolvedValue({ id: 'fg1', qaReleased: true }) },
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(existingInward),
        create: jest.fn().mockResolvedValue({}),
      },
      finishedGoodsStock: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      finishedGoodsBatch: { findUnique: jest.fn().mockResolvedValue(b) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wh1', isActive: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    return { svc: new QualityService(prisma), tx };
  }

  it('inwards packCount to the production warehouse with a PRODUCTION_INWARD ledger row', async () => {
    const { svc, tx } = build(batch());
    await svc.releaseBatch('fg1', 'u1');
    expect(tx.finishedGoodsStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ warehouseId: 'wh1', quantity: 16 }) }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'PRODUCTION_INWARD',
        quantity: 16,
        reference: 'QA_RELEASE_AUTO',
        fgBatchId: 'fg1',
      }),
    });
  });

  it('does not inward twice when the batch was already inwarded (re-release)', async () => {
    const { svc, tx } = build(batch(), { id: 'm1' });
    await svc.releaseBatch('fg1', 'u1');
    expect(tx.finishedGoodsStock.upsert).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('refuses a non-PASS batch and stocks nothing', async () => {
    const { svc, tx } = build(batch({ qualityInspections: [{ result: 'FAIL' }] }));
    await expect(svc.releaseBatch('fg1', 'u1')).rejects.toThrow(BadRequestException);
    expect(tx.finishedGoodsStock.upsert).not.toHaveBeenCalled();
  });

  it('refuses when no target node can be determined', async () => {
    const { svc } = build(batch({ productionBatch: { warehouseId: null, branchId: 'b1' } }));
    await expect(svc.releaseBatch('fg1', 'u1')).rejects.toThrow(/No target warehouse/);
  });
});
