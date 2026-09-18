import { resolveOtpMode, generateOtpCode, mockOtpCode } from './otp.config';

/**
 * `resolveOtpMode` is the one place that decides whether a fixed code is
 * accepted for every customer. If this ever returns "mock" while
 * NODE_ENV=production, every account in the system opens to anyone who knows
 * six digits - so the refusal is pinned here rather than trusted to review.
 */
describe('otp.config', () => {
  describe('resolveOtpMode', () => {
    it('defaults to mock outside production', () => {
      expect(resolveOtpMode({ NODE_ENV: 'development' } as any)).toBe('mock');
      expect(resolveOtpMode({ NODE_ENV: 'test' } as any)).toBe('mock');
    });

    it('defaults to sms in production', () => {
      expect(
        resolveOtpMode({ NODE_ENV: 'production', CUSTOMER_OTP_MODE: 'sms' } as any),
      ).toBe('sms');
    });

    it('refuses to boot with mock mode explicitly requested in production', () => {
      expect(() =>
        resolveOtpMode({ NODE_ENV: 'production', CUSTOMER_OTP_MODE: 'mock' } as any),
      ).toThrow(/refused/);
    });

    it('an unset mode in production defaults to sms, not the unsafe mock default', () => {
      expect(resolveOtpMode({ NODE_ENV: 'production' } as any)).toBe('sms');
    });

    it('rejects an unrecognised mode outright', () => {
      expect(() =>
        resolveOtpMode({ NODE_ENV: 'development', CUSTOMER_OTP_MODE: 'carrier-pigeon' } as any),
      ).toThrow();
    });
  });

  describe('generateOtpCode', () => {
    it('mock mode always returns the configured fixed code', () => {
      const env = { CUSTOMER_OTP_MOCK_CODE: '654321' } as any;
      expect(generateOtpCode('mock', env)).toBe('654321');
      expect(generateOtpCode('mock', env)).toBe('654321');
    });

    it('falls back to 123456 when no override is set', () => {
      expect(mockOtpCode({} as any)).toBe('123456');
    });

    it('sms mode generates a 6-digit code, not the fixed one', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const code = generateOtpCode('sms', {} as any);
        expect(code).toMatch(/^\d{6}$/);
        seen.add(code);
      }
      // Vanishingly unlikely to collide 20 times running on a CSPRNG if this
      // is actually randomising rather than returning a constant.
      expect(seen.size).toBeGreaterThan(1);
    });
  });
});
