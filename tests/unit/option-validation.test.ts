/**
 * `validateOptionValues` is a client-side copy of the backend's option contract
 * (`validateOptionSelection` in the admin repo's src/lib/service-options.ts).
 * These cases mirror the backend's rules, so a divergence fails HERE instead of
 * reaching a customer as "400 INVALID_ORDER_INPUT" after they pressed the order
 * button.
 *
 * Two of these rules were WRONG in this app until now, in the lenient direction:
 * a decimal ("2.5") passed here and was rejected by the backend, and a dropdown
 * with no configured choices accepted any value (the backend resolves the value
 * through `choices?.find(...)`, so it can never accept one).
 */
import { describe, it, expect } from 'vitest';
import { summarizeOptionErrors, validateOptionValues } from '@/lib/order-form';
import type { OptionField } from '@/lib/api';

const dropdown = (over: Partial<OptionField> = {}): OptionField => ({
  key: 'colour',
  label: 'Colour',
  type: 'dropdown',
  choices: ['Gold', 'Silver'],
  ...over,
});

const number = (over: Partial<OptionField> = {}): OptionField => ({
  key: 'width',
  label: 'Width',
  type: 'number',
  ...over,
});

const text = (over: Partial<OptionField> = {}): OptionField => ({
  key: 'message',
  label: 'Topper message',
  type: 'text',
  ...over,
});

describe('validateOptionValues — required', () => {
  it('passes with no fields at all', () => {
    expect(validateOptionValues(null, {}).valid).toBe(true);
    expect(validateOptionValues(undefined, {})).toEqual({ valid: true, errors: {} });
    expect(validateOptionValues([], {}).valid).toBe(true);
  });

  it('reports a required field that was never filled in', () => {
    const r = validateOptionValues([dropdown({ required: true })], {});
    expect(r.valid).toBe(false);
    expect(r.errors.colour).toBe('Colour is required');
  });

  it('treats whitespace-only as empty', () => {
    expect(validateOptionValues([text({ required: true })], { message: '   ' }).errors.message).toBe(
      'Topper message is required',
    );
  });

  it('never complains about an empty OPTIONAL field', () => {
    expect(validateOptionValues([text({ maxLength: 10 })], { message: '' }).valid).toBe(true);
    expect(validateOptionValues([number({ min: 5 })], { width: '' }).valid).toBe(true);
  });
});

describe('validateOptionValues — dropdown choices', () => {
  it('accepts a listed choice, including { value, image } objects', () => {
    expect(validateOptionValues([dropdown({ required: true })], { colour: 'Gold' }).valid).toBe(true);
    const withImage = dropdown({ choices: [{ value: 'Gold', image: 'https://x/g.png' }] });
    expect(validateOptionValues([withImage], { colour: 'Gold' }).valid).toBe(true);
  });

  it('rejects a value that is no longer in the list', () => {
    expect(validateOptionValues([dropdown()], { colour: 'Chartreuse' }).errors.colour).toBe(
      'Colour must be one of the listed options',
    );
  });

  it('rejects ANY value when the dropdown lists no choices', () => {
    expect(validateOptionValues([dropdown({ choices: [] })], { colour: 'anything' }).valid).toBe(false);
    expect(validateOptionValues([dropdown({ choices: undefined })], { colour: 'anything' }).valid).toBe(false);
  });

  it('tolerates surrounding whitespace in a choice', () => {
    expect(validateOptionValues([dropdown()], { colour: '  Gold  ' }).valid).toBe(true);
  });
});

describe('validateOptionValues — numbers', () => {
  it('requires a WHOLE number', () => {
    expect(validateOptionValues([number()], { width: 'ten' }).errors.width).toBe('Width must be a whole number');
    expect(validateOptionValues([number()], { width: '2.5' }).errors.width).toBe('Width must be a whole number');
    expect(validateOptionValues([number()], { width: '3' }).valid).toBe(true);
    expect(validateOptionValues([number()], { width: '3.0' }).valid).toBe(true);
    expect(validateOptionValues([number()], { width: '-4' }).valid).toBe(true);
  });

  it('enforces min and max, and accepts the bounds themselves', () => {
    const field = number({ min: 10, max: 100 });
    expect(validateOptionValues([field], { width: '9' }).errors.width).toBe('Width must be at least 10');
    expect(validateOptionValues([field], { width: '101' }).errors.width).toBe('Width must be at most 100');
    expect(validateOptionValues([field], { width: '10' }).valid).toBe(true);
    expect(validateOptionValues([field], { width: '100' }).valid).toBe(true);
  });

  it('applies min alone and max alone', () => {
    expect(validateOptionValues([number({ min: 5 })], { width: '4' }).valid).toBe(false);
    expect(validateOptionValues([number({ min: 5 })], { width: '500000' }).valid).toBe(true);
    expect(validateOptionValues([number({ max: 5 })], { width: '6' }).valid).toBe(false);
  });

  it('does not apply a length limit to a number field', () => {
    expect(validateOptionValues([number({ min: 0, max: 999999 })], { width: '12345' }).valid).toBe(true);
  });
});

describe('validateOptionValues — text length', () => {
  it('rejects text over maxLength, accepts it at exactly the limit', () => {
    const field = text({ maxLength: 5 });
    expect(validateOptionValues([field], { message: '123456' }).errors.message).toBe(
      'Topper message must be at most 5 characters',
    );
    expect(validateOptionValues([field], { message: '12345' }).valid).toBe(true);
  });

  it('measures the TRIMMED length, like the backend', () => {
    expect(validateOptionValues([text({ maxLength: 5 })], { message: '  abcde  ' }).valid).toBe(true);
  });

  it('applies maxLength to a textarea too', () => {
    const r = validateOptionValues([{ key: 'n', label: 'Notes', type: 'textarea', maxLength: 3 }], { n: 'abcd' });
    expect(r.valid).toBe(false);
  });
});

describe('validateOptionValues — several fields', () => {
  it('reports every problem, not just the first (the backend stops at one)', () => {
    const r = validateOptionValues(
      [dropdown({ required: true }), number({ key: 'width', label: 'Width', min: 10 }), text({ required: true })],
      { width: '3' },
    );
    expect(Object.keys(r.errors).sort()).toEqual(['colour', 'message', 'width']);
    expect(r.errors.width).toBe('Width must be at least 10');
  });

  it('reports a required-empty field once, not as two problems', () => {
    expect(Object.values(validateOptionValues([number({ required: true })], {}).errors)).toEqual([
      'Width is required',
    ]);
  });

  it('ignores values for keys that are not fields', () => {
    expect(validateOptionValues([dropdown()], { colour: 'Gold', stale: 'whatever' }).valid).toBe(true);
  });
});

describe('summarizeOptionErrors', () => {
  it('returns null when there is nothing to say', () => {
    expect(summarizeOptionErrors({})).toBeNull();
    expect(summarizeOptionErrors({ a: '' })).toBeNull();
  });

  it('returns a single message verbatim', () => {
    expect(summarizeOptionErrors({ colour: 'Colour is required' })).toBe('Colour is required');
  });

  it('joins two and counts the rest instead of listing them all', () => {
    expect(summarizeOptionErrors({ a: 'A is required', b: 'B is required' })).toBe('A is required; B is required');
    expect(summarizeOptionErrors({ a: 'A is required', b: 'B is required', c: 'C must be a whole number' })).toBe(
      'A is required; B is required; +1 more',
    );
  });
});
