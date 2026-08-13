import { createHash } from 'node:crypto';
import { cloudinarySignature } from './cloudinary.storage';

/**
 * Cloudinary answers a bad signature with a bare "Invalid Signature" and no
 * indication of which part was wrong, so the canonicalisation is worth pinning.
 *
 * These tests check the *string that gets hashed*, independently computed, not
 * a magic hex value copied from somewhere — a hard-coded digest would pass
 * happily even if both the code and the expectation were wrong together.
 */
describe('cloudinarySignature', () => {
  const sha1 = (input: string) => createHash('sha1').update(input).digest('hex');

  it('sorts parameters alphabetically regardless of insertion order', () => {
    const expected = sha1('public_id=sample_image&timestamp=1315060510abcd');

    // Same params, opposite insertion order - both must canonicalise the same.
    expect(cloudinarySignature({ timestamp: 1315060510, public_id: 'sample_image' }, 'abcd')).toBe(
      expected,
    );
    expect(cloudinarySignature({ public_id: 'sample_image', timestamp: 1315060510 }, 'abcd')).toBe(
      expected,
    );
  });

  it('joins with & and appends the secret with no separator', () => {
    expect(cloudinarySignature({ folder: 'svv/x', timestamp: 100 }, 'SECRET')).toBe(
      sha1('folder=svv/x&timestamp=100SECRET'),
    );
  });

  it('handles a single parameter', () => {
    expect(cloudinarySignature({ timestamp: 42 }, 's')).toBe(sha1('timestamp=42s'));
  });

  it('stringifies numbers rather than JSON-encoding them', () => {
    // A number that stringified wrongly would fail against Cloudinary with no
    // clue why, so it is worth being explicit.
    expect(cloudinarySignature({ timestamp: 1755100000 }, 'k')).toBe(
      sha1('timestamp=1755100000k'),
    );
  });

  it('produces a different signature for a different secret', () => {
    const params = { folder: 'svv/x', timestamp: 100 };
    expect(cloudinarySignature(params, 'one')).not.toBe(cloudinarySignature(params, 'two'));
  });

  it('produces a different signature when any parameter changes', () => {
    expect(cloudinarySignature({ folder: 'a', timestamp: 1 }, 's')).not.toBe(
      cloudinarySignature({ folder: 'b', timestamp: 1 }, 's'),
    );
  });

  it('returns a 40-character hex digest', () => {
    expect(cloudinarySignature({ timestamp: 1 }, 's')).toMatch(/^[0-9a-f]{40}$/);
  });
});
