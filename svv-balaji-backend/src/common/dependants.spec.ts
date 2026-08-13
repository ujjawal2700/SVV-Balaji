import { ConflictException } from '@nestjs/common';
import { assertDeletable } from './dependants';

/**
 * The refusal message is the whole point of this helper - without it the user
 * sees a raw `P2003 Foreign key constraint failed`, which tells them nothing
 * about which of a dozen relations is blocking them.
 */
describe('assertDeletable', () => {
  it('permits deletion when nothing references the record', () => {
    expect(() =>
      assertDeletable('Branch', 'Nagpur', { users: 0, farmers: 0, warehouses: 0 }),
    ).not.toThrow();
  });

  it('permits deletion when there are no relations to check at all', () => {
    expect(() => assertDeletable('Branch', 'Nagpur', {})).not.toThrow();
  });

  it('refuses with a 409 and names what is blocking', () => {
    let error: ConflictException | undefined;
    try {
      assertDeletable('Branch', 'Nagpur', { users: 3, farmers: 0, warehouses: 1 });
    } catch (caught) {
      error = caught as ConflictException;
    }

    expect(error).toBeInstanceOf(ConflictException);
    const message = error!.message;
    expect(message).toContain('Nagpur');
    expect(message).toContain('3 users');
    expect(message).toContain('1 warehouse');
    // Zero counts must not appear - listing "0 farmers" as a blocker would
    // send someone looking for farmers that do not exist.
    expect(message).not.toContain('farmer');
  });

  it('singularises a lone blocker so the message reads naturally', () => {
    expect(() => assertDeletable('User', 'Asha', { collections: 1 })).toThrow(
      /1 collection still references it/,
    );
  });

  it('handles irregular plurals rather than emitting "1 batche"', () => {
    expect(() => assertDeletable('Product', 'Toor Dal', { batches: 1 })).toThrow(/1 batch /);
    expect(() => assertDeletable('Product', 'Toor Dal', { inspections: 1 })).toThrow(
      /1 inspection /,
    );
  });

  it('joins several blockers the way a person would write them', () => {
    expect(() =>
      assertDeletable('Warehouse', 'Central', {
        batches: 2,
        'stock lines': 5,
        orders: 1,
      }),
    ).toThrow(/2 batches, 5 stock lines and 1 order/);
  });

  it('always points at deactivation as the alternative', () => {
    expect(() => assertDeletable('Branch', 'Nagpur', { users: 1 })).toThrow(/Deactivate it instead/);
  });
});
