import { OutOfStockException, assertEnough, availableByProduct } from './stock-holds';

/** availableByProduct with a stand-in for the two tables it reads. */
const client = (stock: Array<{ q: number; r: number; p: string }>, holds: Array<{ p: string; sum: number }>) =>
  ({
    finishedGoodsStock: { findMany: async () => stock.map((s) => ({ quantity: s.q, reservedQuantity: s.r, fgBatch: { productId: s.p } })) },
    stockReservation: { groupBy: async () => holds.map((h) => ({ productId: h.p, _sum: { quantity: h.sum } })) },
  }) as never;

describe('availableByProduct', () => {
  it('is stock minus physical allocations minus active holds, per product', async () => {
    const c = client([{ q: 20, r: 5, p: 'a' }, { q: 10, r: 0, p: 'a' }, { q: 8, r: 8, p: 'b' }], [{ p: 'a', sum: 7 }]);
    const m = await availableByProduct(c, 'w', ['a', 'b', 'c']);
    expect(m.get('a')).toBe(15 + 10 - 7);
    expect(m.get('b')).toBe(0);
    expect(m.get('c')).toBe(0);
  });

  it('never goes negative when holds exceed stock', async () => {
    const m = await availableByProduct(client([{ q: 3, r: 0, p: 'a' }], [{ p: 'a', sum: 9 }]), 'w', ['a']);
    expect(m.get('a')).toBe(0);
  });
});

describe('assertEnough', () => {
  it('passes when everything is available and lists every short product otherwise', () => {
    expect(() => assertEnough([{ productId: 'a', quantity: 2 }], new Map([['a', 2]]))).not.toThrow();
    let caught: unknown;
    try {
      assertEnough([{ productId: 'a', quantity: 5 }, { productId: 'b', quantity: 1 }], new Map([['a', 2], ['b', 1]]));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OutOfStockException);
    expect((caught as OutOfStockException).shortages).toEqual([{ productId: 'a', requested: 5, available: 2 }]);
  });
});
