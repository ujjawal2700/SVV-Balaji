import { BadRequestException } from '@nestjs/common';
import { endOfIstDay, settle } from './payouts.service';

describe('rider payouts - money rules', () => {
  it('net = gross - cash kept by the rider', () => {
    expect(settle(50_000, 20_000, 15_000)).toEqual({ grossP: 50_000, offsetP: 15_000, netP: 35_000 });
    expect(settle(50_000, 0, 0).netP).toBe(50_000);
  });

  it('a set-off can be neither more than the cash held nor more than is owed', () => {
    expect(() => settle(50_000, 10_000, 10_001)).toThrow(/holds only ₹100.00/);
    expect(() => settle(5_000, 80_000, 6_000)).toThrow(/cannot exceed what is owed/);
    expect(() => settle(5_000, -2_000, 1)).toThrow(BadRequestException);
  });

  it('nothing to pay when clawbacks cancel out earnings', () => {
    expect(() => settle(0, 0, 0)).toThrow(/Nothing is owed/);
    expect(() => settle(-500, 0, 0)).toThrow(/Nothing is owed/);
  });

  it('upTo covers the whole IST day', () => {
    expect(endOfIstDay('2026-10-04').toISOString()).toBe('2026-10-04T18:30:00.000Z');
    expect(() => endOfIstDay('2026-02-31x')).toThrow(BadRequestException);
  });
});
