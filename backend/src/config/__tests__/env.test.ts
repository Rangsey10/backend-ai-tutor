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
});
