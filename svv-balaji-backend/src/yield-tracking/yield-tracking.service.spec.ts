import { YieldTrackingService } from './yield-tracking.service';

/**
 * Loss/yield math is the whole point of this service, so these tests pin the
 * arithmetic across the three existing phases (Cleaning & Grading ->
 * Production -> Finished Goods) rather than the mocks around it.
 *
 * Fixture chain, chosen so every stage has a distinct, checkable loss:
 *   - Cleaning:  1000 kg in, 30 kg wastage, 20 kg by-product -> 950 kg out (3% loss)
 *   - Production: 950 kg consumed, 900 kg actual -> 50 kg loss (~5.26% loss)
 *   - Finished Goods: 900 kg in, 1700 packs x 0.5 kg = 850 kg out -> 50 kg loss (~5.56%)
 *   - Total loss: 30 + 50 + 50 = 130 of 1000 input = 13% -> above the 8% ceiling, HIGH alert.
 */
describe('YieldTrackingService', () => {
  let prisma: any;
  let service: YieldTrackingService;

  const productionBatchFixture = {
    id: 'pb-1',
    productionBatchNumber: 'PB-20260918-001',
    branchId: 'branch-1',
    machineName: 'Mill A',
    machineNumber: 'M-01',
    productionDate: new Date('2026-09-18'),
    actualQuantity: 900,
    productionLoss: 50,
    byProductQuantity: 0,
    product: { id: 'prod-1', name: 'Wheat Flour' },
    consumptions: [
      {
        quantityUsed: 950,
        rawMaterialBatch: {
          quantity: 1000,
          cleaningGradingRecords: [{ wastageQuantity: 30, byProductQuantity: 20 }],
        },
      },
    ],
    finishedGoodsBatches: [
      { fgBatchNumber: 'FG-20260918-001', netWeight: 0.5, packCount: 1700 },
    ],
  };

  beforeEach(() => {
    prisma = {
      productionBatch: {
        findUnique: jest.fn(async () => productionBatchFixture),
      },
      finishedGoodsBatch: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.fgBatchNumber === 'FG-20260918-001' ? { productionBatchId: 'pb-1' } : null,
        ),
      },
    };
    service = new YieldTrackingService(prisma);
  });

  it('computes stage-wise loss % and chain totals correctly', async () => {
    const chain = await service.detail({ productionBatchId: 'pb-1' });

    const [cleaning, production, finishedGoods] = chain.stages;

    expect(cleaning.inputQuantity).toBe(1000);
    expect(cleaning.lossQuantity).toBe(30);
    expect(cleaning.lossPercent).toBe(3);
    expect(cleaning.byProductQuantity).toBe(20);

    expect(production.inputQuantity).toBe(950);
    expect(production.outputQuantity).toBe(900);
    expect(production.lossQuantity).toBe(50);
    expect(production.lossPercent).toBeCloseTo(5.26, 2);

    expect(finishedGoods.inputQuantity).toBe(900);
    expect(finishedGoods.outputQuantity).toBe(850);
    expect(finishedGoods.lossQuantity).toBe(50);
    expect(finishedGoods.lossPercent).toBeCloseTo(5.56, 2);

    expect(chain.totalInput).toBe(1000);
    expect(chain.totalLoss).toBe(130);
    expect(chain.totalByProduct).toBe(20);
    expect(chain.finalOutput).toBe(850);
    expect(chain.totalLossPercent).toBe(13);
    expect(chain.overallYieldPercent).toBe(85);
  });

  it('flags a chain whose total loss exceeds the 8% ceiling as HIGH', async () => {
    const chain = await service.detail({ productionBatchId: 'pb-1' });
    expect(chain.alertLevel).toBe('HIGH');
  });

  it('does not flag a chain within the normal 4-8% loss band', async () => {
    prisma.productionBatch.findUnique = jest.fn(async () => ({
      ...productionBatchFixture,
      actualQuantity: 940,
      productionLoss: 10,
      consumptions: [
        {
          quantityUsed: 950,
          rawMaterialBatch: {
            quantity: 1000,
            cleaningGradingRecords: [{ wastageQuantity: 30, byProductQuantity: 0 }],
          },
        },
      ],
      finishedGoodsBatches: [{ fgBatchNumber: 'FG-20260918-002', netWeight: 0.5, packCount: 1860 }],
    }));

    const chain = await service.detail({ productionBatchId: 'pb-1' });
    // total loss = 30 (cleaning) + 10 (production) + 10 (fg, 940-930) = 50 of 1000 = 5%
    expect(chain.totalLossPercent).toBe(5);
    expect(chain.alertLevel).toBe('NORMAL');
  });

  it('resolves the full chain end to end from an fgBatchNumber, same as by productionBatchId', async () => {
    const byNumber = await service.detail({ fgBatchNumber: 'FG-20260918-001' });
    const byId = await service.detail({ productionBatchId: 'pb-1' });

    expect(prisma.finishedGoodsBatch.findUnique).toHaveBeenCalledWith({
      where: { fgBatchNumber: 'FG-20260918-001' },
      select: { productionBatchId: true },
    });
    expect(byNumber.productionBatchId).toBe('pb-1');
    expect(byNumber.fgBatchNumbers).toContain('FG-20260918-001');
    expect(byNumber).toEqual(byId);
  });
});
