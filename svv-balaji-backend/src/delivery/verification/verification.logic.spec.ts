import { assessDeposit, assessDocument, assessVerification, endOfExpiryDay, isVerifiedNow, type DocFacts, type DocTypeFacts } from './verification.logic';

const NOW = new Date('2026-10-05T06:30:00Z'); // 12:00 IST
const type = (id: string, over: Partial<DocTypeFacts> = {}): DocTypeFacts => ({
  id, code: id.toUpperCase(), name: id, isMandatory: true, isActive: true, isSystem: false, sortOrder: 0, ...over,
});
let seq = 0;
const doc = (typeId: string, status: DocFacts['status'], over: Partial<DocFacts> = {}): DocFacts => ({
  id: `d${++seq}`, typeId, status, expiresOn: null, supersededAt: null, createdAt: new Date(NOW.getTime() - (100 - seq) * 60_000), ...over,
});
const date = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

describe('assessDocument', () => {
  it('nothing uploaded', () => {
    const a = assessDocument(type('dl'), [], NOW);
    expect(a).toMatchObject({ state: 'NOT_UPLOADED', satisfied: false, canUpload: true });
  });

  it('pending is not satisfied; the rider may replace it', () => {
    expect(assessDocument(type('dl'), [doc('dl', 'PENDING')], NOW)).toMatchObject({ state: 'PENDING', satisfied: false, canUpload: true });
  });

  it('rejected asks for a re-upload', () => {
    expect(assessDocument(type('dl'), [doc('dl', 'REJECTED')], NOW)).toMatchObject({ state: 'REJECTED', satisfied: false, canUpload: true });
  });

  it('approved with no expiry: satisfied, no re-upload', () => {
    expect(assessDocument(type('dl'), [doc('dl', 'APPROVED')], NOW)).toMatchObject({ state: 'APPROVED', satisfied: true, validUntil: null, canUpload: false });
  });

  it('expiry date counts through the end of that day in India', () => {
    const a = assessDocument(type('dl'), [doc('dl', 'APPROVED', { expiresOn: date('2026-10-05') })], NOW);
    expect(a.satisfied).toBe(true);
    expect(a.validUntil?.toISOString()).toBe('2026-10-05T18:30:00.000Z');
    expect(a.canUpload).toBe(true); // inside the renewal window
  });

  it('an expired approval no longer counts', () => {
    const a = assessDocument(type('dl'), [doc('dl', 'APPROVED', { expiresOn: date('2026-10-04') })], NOW);
    expect(a).toMatchObject({ state: 'EXPIRED', satisfied: false, canUpload: true });
  });

  it('renewal pending behind a valid approval keeps the rider satisfied', () => {
    const a = assessDocument(type('dl'), [doc('dl', 'APPROVED', { expiresOn: date('2026-10-20') }), doc('dl', 'PENDING')], NOW);
    expect(a).toMatchObject({ state: 'PENDING', satisfied: true });
  });

  it('superseded uploads are ignored', () => {
    const a = assessDocument(type('dl'), [doc('dl', 'APPROVED', { supersededAt: NOW })], NOW);
    expect(a.state).toBe('NOT_UPLOADED');
  });

  it('far-off expiry blocks a re-upload', () => {
    expect(assessDocument(type('dl'), [doc('dl', 'APPROVED', { expiresOn: date('2027-10-05') })], NOW).canUpload).toBe(false);
  });
});

describe('assessDeposit', () => {
  it('not required', () => expect(assessDeposit({ required: false, amount: 2000 }, 0)).toMatchObject({ status: 'NOT_REQUIRED', satisfied: true, pending: 0, requiredAmount: 0 }));
  it('not paid', () => expect(assessDeposit({ required: true, amount: 2000 }, 0)).toMatchObject({ status: 'NOT_PAID', satisfied: false, pending: 2000 }));
  it('partly paid', () => expect(assessDeposit({ required: true, amount: 2000 }, 500)).toMatchObject({ status: 'PARTIALLY_PAID', pending: 1500 }));
  it('paid in full or more', () => expect(assessDeposit({ required: true, amount: 2000 }, 2500)).toMatchObject({ status: 'PAID', satisfied: true, pending: 0 }));
  it('paise do not leave a phantom balance', () => expect(assessDeposit({ required: true, amount: 0.3 }, 0.1 + 0.2).satisfied).toBe(true));
});

describe('assessVerification', () => {
  const types = [type('dl', { sortOrder: 1 }), type('pcc', { code: 'PCC', isSystem: true, isMandatory: false, sortOrder: 3 }), type('rc', { isMandatory: false, sortOrder: 4 }), type('old', { isActive: false })];
  const noDeposit = { required: false, amount: 0, paid: 0 };

  it('PCC is mandatory even if the flag says otherwise; inactive types are left out', () => {
    const a = assessVerification(types, [doc('dl', 'APPROVED')], noDeposit, NOW);
    expect(a.eligible).toBe(false);
    expect(a.pcc?.mandatory).toBe(true);
    expect(a.missing).toEqual(['pcc: not uploaded']);
    expect(a.documents.map((d) => d.code)).toEqual(['DL', 'PCC', 'RC']);
  });

  it('optional documents do not block', () => {
    const a = assessVerification(types, [doc('dl', 'APPROVED'), doc('pcc', 'APPROVED')], noDeposit, NOW);
    expect(a.eligible).toBe(true);
    expect(a.verifiedUntil).toBeNull();
  });

  it('deposit rule blocks until paid', () => {
    const docs = [doc('dl', 'APPROVED'), doc('pcc', 'APPROVED')];
    const a = assessVerification(types, docs, { required: true, amount: 1000, paid: 400 }, NOW);
    expect(a.eligible).toBe(false);
    expect(a.missing).toEqual(['Security deposit: ₹600 still to pay']);
    expect(assessVerification(types, docs, { required: true, amount: 1000, paid: 1000 }, NOW).eligible).toBe(true);
  });

  it('verifiedUntil is the earliest mandatory expiry', () => {
    const a = assessVerification(types, [
      doc('dl', 'APPROVED', { expiresOn: date('2027-01-31') }),
      doc('pcc', 'APPROVED', { expiresOn: date('2026-12-31') }),
      doc('rc', 'APPROVED', { expiresOn: date('2026-11-01') }), // optional: ignored
    ], noDeposit, NOW);
    expect(a.verifiedUntil).toEqual(endOfExpiryDay(date('2026-12-31')));
  });

  it('a rejected mandatory document blocks', () => {
    const a = assessVerification(types, [doc('dl', 'REJECTED'), doc('pcc', 'APPROVED')], noDeposit, NOW);
    expect(a.missing).toEqual(['dl: rejected - upload again']);
  });
});

describe('isVerifiedNow', () => {
  it('lapses at verifiedUntil without a recompute', () => {
    expect(isVerifiedNow({ isVerified: true, verifiedUntil: null }, NOW)).toBe(true);
    expect(isVerifiedNow({ isVerified: true, verifiedUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    expect(isVerifiedNow({ isVerified: true, verifiedUntil: NOW }, NOW)).toBe(false);
    expect(isVerifiedNow({ isVerified: false, verifiedUntil: null }, NOW)).toBe(false);
  });
});
