describe('customer-token.config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('refuses to resolve without CUSTOMER_JWT_ACCESS_SECRET set', async () => {
    delete process.env.CUSTOMER_JWT_ACCESS_SECRET;
    const { customerAccessSecret } = await import('./customer-token.config');
    expect(() => customerAccessSecret()).toThrow(/not set/);
  });

  it('refuses when the customer secret equals the staff secret - the exact misconfiguration that would let a storefront token pass JwtAuthGuard', async () => {
    process.env.JWT_ACCESS_SECRET = 'shared-secret';
    process.env.CUSTOMER_JWT_ACCESS_SECRET = 'shared-secret';
    const { customerAccessSecret } = await import('./customer-token.config');
    expect(() => customerAccessSecret()).toThrow(/must not equal/);
  });

  it('resolves cleanly when the secrets differ', async () => {
    process.env.JWT_ACCESS_SECRET = 'staff-secret';
    process.env.CUSTOMER_JWT_ACCESS_SECRET = 'customer-secret';
    const { customerAccessSecret } = await import('./customer-token.config');
    expect(customerAccessSecret()).toBe('customer-secret');
  });

  it('applies the same isolation to the refresh secret', async () => {
    process.env.JWT_REFRESH_SECRET = 'shared-refresh';
    process.env.CUSTOMER_JWT_REFRESH_SECRET = 'shared-refresh';
    const { customerRefreshSecret } = await import('./customer-token.config');
    expect(() => customerRefreshSecret()).toThrow(/must not equal/);
  });
});
