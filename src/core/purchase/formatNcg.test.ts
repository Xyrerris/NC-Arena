import { formatNcg } from './formatNcg';

describe('formatNcg', () => {
  it('writes whole prices bare and groups thousands the way the app does', () => {
    expect(formatNcg(1)).toBe('1');
    expect(formatNcg(1250)).toBe('1.250');
    expect(formatNcg(0)).toBe('0');
  });

  it('writes up to two decimals with a comma, and drops a trailing zero', () => {
    expect(formatNcg(142.5)).toBe('142,5');
    expect(formatNcg(0.25)).toBe('0,25');
    expect(formatNcg(3.05)).toBe('3,05');
    expect(formatNcg(1234.56)).toBe('1.234,56');
  });

  it('does not show a real price as zero', () => {
    expect(formatNcg(0.004)).toBe('<0,01');
  });
});
