import { NotFoundException } from '@nestjs/common';
import { StorefrontTraceService } from './storefront-trace.service';

const batch = (over: Record<string, unknown> = {}) => ({
  fgBatchNumber: 'FG-20260905-001',
  netWeight: '5',
  weightUnit: 'KG',
  packagingType: 'pouch',
  manufacturingDate: new Date('2026-09-04'),
  packagingDate: new Date('2026-09-05'),
  expiryDate: new Date('2027-03-05'),
  qaReleased: true,
  holdStatus: 'ACTIVE',
  product: { name: 'Sharbati Atta', category: 'Flour' },
  qualityInspections: [
    { stage: 'FINISHED_GOODS', result: 'PASS', createdAt: new Date(), shelfLifeVerified: true },
  ],
  productionBatch: {
    productionDate: new Date('2026-09-04'),
    qualityInspections: [{ id: 'ip-1' }],
    branch: { name: 'Sehore Plant' },
    consumptions: [
      {
        rawMaterialBatch: {
          cropName: 'Wheat',
          farmer: { id: 'f1', village: 'Ashta', district: 'Sehore', state: 'Madhya Pradesh' },
          supplier: null,
          collection: { collectionDate: new Date('2026-04-20') },
          qualityInspections: [
            { moisture: '10.00', purity: '99.00', foreignMatter: '0.50' },
            { moisture: '12.00', purity: '98.00', foreignMatter: null },
          ],
        },
      },
    ],
  },
  ...over,
});

const serviceFor = (row: unknown) =>
  new StorefrontTraceService({ finishedGoodsBatch: { findUnique: jest.fn(async () => row) } } as any);

describe('StorefrontTraceService', () => {
  it('resolves a released pack to region-level origin and averaged lab values', async () => {
    const res: any = await serviceFor(batch()).trace('fg-20260905-001');
    expect(res.status).toBe('VERIFIED');
    expect(res.origin.regions).toEqual([{ village: 'Ashta', district: 'Sehore', state: 'Madhya Pradesh' }]);
    expect(res.origin.growerCount).toBe(1);
    expect(res.quality.moisturePercent).toBe(11);
    expect(res.quality.foreignMatterPercent).toBe(0.5);
    expect(res.quality.finishedGoodsPassed).toBe(true);
  });

  it('reads each QC stage from the record it was actually made against', async () => {
    const res: any = await serviceFor(batch()).trace('FG-20260905-001');
    expect(res.quality.rawMaterialPassed).toBe(true); // raw lot has PASS inspections
    expect(res.quality.inProcessPassed).toBe(true); // production run has one

    const row: any = batch();
    row.productionBatch.qualityInspections = [];
    row.productionBatch.consumptions.push({
      rawMaterialBatch: { ...row.productionBatch.consumptions[0].rawMaterialBatch, qualityInspections: [] },
    });
    const partial: any = await serviceFor(row).trace('FG-20260905-001');
    expect(partial.quality.inProcessPassed).toBe(false);
    // One raw lot never passed inspection, so the pack must not claim "raw material tested".
    expect(partial.quality.rawMaterialPassed).toBe(false);
  });

  it('never leaks farmer identity, contact, GPS or money', async () => {
    const row: any = batch();
    // Even if a future query widened its select, the projection must not forward it.
    row.productionBatch.consumptions[0].rawMaterialBatch.farmer = {
      id: 'f1', village: 'Ashta', district: 'Sehore', state: 'MP',
      fullName: 'Ramesh Patel', phone: '9999999999', farmerCode: 'SVV-2026-000001', gpsLocation: '23.1,77.2',
    };
    const json = JSON.stringify(await serviceFor(row).trace('FG-20260905-001'));
    for (const secret of ['Ramesh', '9999999999', 'SVV-2026-000001', '23.1,77.2', 'purchaseRate']) {
      expect(json).not.toContain(secret);
    }
  });

  it('flags a frozen batch but still shows the trace', async () => {
    const res: any = await serviceFor(batch({ holdStatus: 'ON_HOLD' })).trace('FG-20260905-001');
    expect(res.status).toBe('ON_HOLD');
    expect(res.origin).toBeDefined();
  });

  it('tells the shopper a recalled pack is recalled, and shows nothing else', async () => {
    const res: any = await serviceFor(batch({ holdStatus: 'RECALLED' })).trace('FG-20260905-001');
    expect(res.status).toBe('RECALLED');
    expect(res.notice).toMatch(/do not consume/i);
    expect(res.origin).toBeUndefined();
    expect(res.quality).toBeUndefined();
  });

  it('404s an unknown or unreleased batch', async () => {
    await expect(serviceFor(null).trace('FG-X')).rejects.toThrow(NotFoundException);
    await expect(serviceFor(batch({ qaReleased: false })).trace('FG-X')).rejects.toThrow(NotFoundException);
  });
});
