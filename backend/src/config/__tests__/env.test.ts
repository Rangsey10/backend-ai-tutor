import { allowsDemoAuthentication, allowsDevelopmentFallbacks } from '../env';

describe('environment fallback policy', () => {
  it('never enables demo or in-memory fallbacks in staging or production', () => {
    expect(allowsDevelopmentFallbacks('staging', true)).toBe(false);
    expect(allowsDevelopmentFallbacks('production', true)).toBe(false);
  });

  it('requires an explicit flag in development', () => {
    expect(allowsDevelopmentFallbacks('development', false)).toBe(false);
    expect(allowsDevelopmentFallbacks('development', true)).toBe(true);
    expect(allowsDevelopmentFallbacks('development', true, 'staging')).toBe(false);
    expect(allowsDevelopmentFallbacks('development', true, 'development')).toBe(true);
  });

  it('never accepts demo authentication in staging or production', () => {
    expect(allowsDemoAuthentication('staging', true)).toBe(false);
    expect(allowsDemoAuthentication('production', true)).toBe(false);
    expect(allowsDemoAuthentication('development', false)).toBe(false);
    expect(allowsDemoAuthentication('development', true)).toBe(true);
    expect(allowsDemoAuthentication('development', true, 'staging')).toBe(false);
  });

  it('does not treat a Jest worker marker as permission to weaken production', () => {
    // Jest sets this marker for workers; deployment mode must still be decided
    // only by the explicit NODE_ENV value.
    expect(process.env.NODE_ENV).toBe('test');
    expect(allowsDemoAuthentication('production', true, 'production')).toBe(false);
    expect(allowsDevelopmentFallbacks('staging', true, 'staging')).toBe(false);
  });
});
