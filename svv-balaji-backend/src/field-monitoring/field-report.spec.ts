import { buildFieldReport, type FieldReportInput } from './field-report';

/**
 * FRD 12.7 field report. These pin the judgement calls procurement and
 * production will act on: when a harvest is approaching or overdue, when a
 * yield counts as a shortfall, and what raises the risk level.
 */
describe('buildFieldReport', () => {
  const NOW = new Date('2026-09-25T06:00:00Z');

  const base = (): FieldReportInput => ({
    now: NOW,
    visit: {
      id: 'a1b2c3d4-0000-0000-0000-000000000000',
      visitDate: new Date('2026-09-25'),
      cropName: 'Wheat',
      cropGrowthStage: 'Vegetative',
      cropHealth: 'Good / Healthy',
      pestStatus: 'No pests detected',
      diseaseObservation: null,
      fertilizerAdvice: 'Urea 20kg/acre',
      irrigationAdvice: null,
      pestControlSuggestions: null,
      harvestPreparation: null,
      yieldPredictionQty: '1000',
      createdAt: NOW,
      expert: { id: 'u1', fullName: 'Asha' },
      branch: { id: 'b1', name: 'Nagpur' },
      documents: [{ id: 'd1', fileUrl: 'x.jpg', fileType: 'photo', createdAt: NOW }],
    },
    farmer: {
      id: 'f1', fullName: 'Ramesh', farmerCode: 'SVV-2026-000001', mobile: '9800000000',
      village: 'Wardha', district: 'Wardha', state: 'MH', gpsLocation: '21.1,79.0',
      farmSizeAcres: '5', landType: 'Black', irrigationType: 'Drip', qualityRating: '82.5', status: 'ACTIVE',
    },
    plots: [{ id: 'p1', name: 'North', surveyNumber: '12', areaAcres: '3.5', currentCrop: 'Wheat', expectedHarvest: null, gpsLocation: null }],
    agreements: [{
      id: 'ag1', cropName: 'wheat', variety: 'HD-2967', expectedQuantity: '1000', purchaseRate: '25',
      harvestDate: new Date('2026-11-30'), status: 'ACTIVE',
    }],
    previousVisit: null,
    plan: null,
    visitCount: 1,
    hasHarvestInspection: false,
  });

  it('builds a stable report number from the visit date and id', () => {
    expect(buildFieldReport(base()).reportNumber).toBe('FR-20260925-A1B2C3');
  });

  it('matches the agreement case-insensitively and reports yield against the contract', () => {
    const r = buildFieldReport(base());
    expect(r.agreement?.id).toBe('ag1');
    expect(r.harvestOutlook.percentOfContract).toBe(100);
    expect(r.harvestOutlook.stage).toBe('NOT_READY');
    expect(r.riskLevel).toBe('LOW');
    expect(r.land.mappedAcres).toBe(3.5);
  });

  it('flags a harvest within 14 days as approaching and tells procurement to book the inspection', () => {
    const input = base();
    input.agreements[0].harvestDate = new Date('2026-10-05');
    const r = buildFieldReport(input);
    expect(r.harvestOutlook.stage).toBe('APPROACHING');
    expect(r.harvestOutlook.daysToHarvest).toBe(10);
    expect(r.nextSteps.procurement[0]).toContain('Book the harvest inspection before 5 Oct 2026');
    expect(r.nextSteps.production.length).toBeGreaterThan(0);
  });

  it('treats a passed harvest date with no inspection as overdue and high risk', () => {
    const input = base();
    input.agreements[0].harvestDate = new Date('2026-09-20');
    const r = buildFieldReport(input);
    expect(r.harvestOutlook.stage).toBe('OVERDUE');
    expect(r.riskLevel).toBe('HIGH');
  });

  it('is READY, not overdue, once an inspection has been raised', () => {
    const input = base();
    input.agreements[0].harvestDate = new Date('2026-09-20');
    input.hasHarvestInspection = true;
    expect(buildFieldReport(input).harvestOutlook.stage).toBe('READY');
  });

  it('reports a yield shortfall below 80% of contract', () => {
    const input = base();
    input.visit.yieldPredictionQty = 700;
    const r = buildFieldReport(input);
    expect(r.harvestOutlook.percentOfContract).toBe(70);
    expect(r.riskLevel).toBe('MEDIUM');
    expect(r.nextSteps.procurement).toContain('Line up alternative supply for the expected shortfall.');
  });

  it('flags a forecast far above the contract as a surplus to confirm', () => {
    const input = base();
    input.visit.yieldPredictionQty = 1600;
    const r = buildFieldReport(input);
    expect(r.flags.some((f) => f.message.includes('160% of the contracted'))).toBe(true);
    expect(r.nextSteps.procurement.some((s) => s.includes('surplus'))).toBe(true);
  });

  it('raises severe pests and poor health to high risk', () => {
    const input = base();
    input.visit.pestStatus = 'Severe Infestation';
    input.visit.cropHealth = 'Diseased / Pest Damaged';
    const r = buildFieldReport(input);
    expect(r.riskLevel).toBe('HIGH');
    expect(r.flags.filter((f) => f.severity === 'HIGH')).toHaveLength(2);
  });

  it('notes a forecast that fell since the previous visit', () => {
    const input = base();
    input.previousVisit = {
      id: 'v0', visitDate: new Date('2026-09-01'), cropHealth: 'Good', cropGrowthStage: 'Germination',
      pestStatus: null, yieldPredictionQty: '1500',
    };
    const r = buildFieldReport(input);
    expect(r.previousVisit?.daysBefore).toBe(24);
    expect(r.flags.some((f) => f.message.includes('dropped from 1,500'))).toBe(true);
  });

  it('counts days on the Indian calendar, not UTC', () => {
    const input = base();
    // Picked as 21 Sep in India = 20 Sep 18:30 UTC.
    input.agreements[0].harvestDate = new Date('2026-09-20T18:30:00Z');
    input.hasHarvestInspection = true;
    const r = buildFieldReport(input);
    expect(r.harvestOutlook.daysToHarvest).toBe(-4);
    expect(r.harvestOutlook.summary).toContain('21 Sept 2026');
  });

  it('copes with a bare visit: no crop, no yield, no agreement', () => {
    const input = base();
    Object.assign(input.visit, { cropName: null, cropGrowthStage: null, yieldPredictionQty: null, documents: [] });
    input.agreements = [];
    const r = buildFieldReport(input);
    expect(r.harvestOutlook.stage).toBe('UNKNOWN');
    expect(r.harvestOutlook.summary).toContain('Not enough information');
    expect(r.agreement).toBeNull();
  });
});
