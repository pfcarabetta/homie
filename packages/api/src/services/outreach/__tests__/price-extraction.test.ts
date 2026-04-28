import { describe, it, expect } from 'vitest';
import { extractPriceFromSpeech } from '../price-extraction';

describe('extractPriceFromSpeech', () => {
  it('extracts an explicit dollar amount embedded in a sentence', () => {
    expect(extractPriceFromSpeech('a service call is about $150')).toBe('$150');
  });

  it('handles "X dollars"', () => {
    expect(extractPriceFromSpeech('it would be 200 dollars')).toBe('$200');
  });

  it('handles "X bucks"', () => {
    expect(extractPriceFromSpeech("it's 175 bucks")).toBe('$175');
  });

  it('handles bare number with context word', () => {
    expect(extractPriceFromSpeech('about 250 for the visit')).toBe('$250');
  });

  it('handles a range with "to"', () => {
    expect(extractPriceFromSpeech('somewhere between 150 to 300')).toBe('$150-$300');
  });

  it('handles a range with "between X and Y"', () => {
    expect(extractPriceFromSpeech('between 200 and 400')).toBe('$200-$400');
  });

  it('handles a hyphen range with $ prefixes', () => {
    expect(extractPriceFromSpeech('$150-$250')).toBe('$150-$250');
  });

  it('handles thousands with comma', () => {
    expect(extractPriceFromSpeech('I charge $1,500 flat')).toBe('$1500');
  });

  it('handles a bare number at end of sentence', () => {
    expect(extractPriceFromSpeech('150')).toBe('$150');
  });

  it('returns null when no price-like content is present', () => {
    expect(extractPriceFromSpeech('yeah sure')).toBeNull();
  });

  it('ignores numbers outside plausible service-quote range', () => {
    // 5551234 is a phone-number digit run, not a service quote.
    // Single bare 7-digit number doesn't satisfy the >=2 and <=5 digit gate.
    expect(extractPriceFromSpeech('call 5551234')).toBeNull();
  });

  it('preserves decimals when present', () => {
    expect(extractPriceFromSpeech('that would be $89.99')).toBe('$89.99');
  });
});
