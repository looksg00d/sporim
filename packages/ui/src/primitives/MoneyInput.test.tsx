import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput, sanitizeMoneyInput } from './MoneyInput';

describe('sanitizeMoneyInput', () => {
  it.each([
    ['20', '20'],
    ['20.5', '20.5'],
    ['18.80', '18.80'],
    ['1.234', '1.23'],
    ['1.999999', '1.99'],
    ['20e5', '205'],
    ['-20', '20'],
    ['+20', '20'],
    ['20,5', '205'],
    ['abc', ''],
    ['1.2.3', '1.23'],
    ['1234567890123', '123456789'],
    ['', ''],
    ['.', '.'],
  ])('%s → %s', (input, expected) => {
    expect(sanitizeMoneyInput(input)).toBe(expected);
  });

  it('never yields more than two decimals', () => {
    for (const input of ['0.001', '99.9999', '5.5555555']) {
      const [, fraction = ''] = sanitizeMoneyInput(input).split('.');
      expect(fraction.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('MoneyInput', () => {
  it('passes sanitized values to onChange', () => {
    const onChange = vi.fn();
    render(<MoneyInput value="" onChange={onChange} label="Your stake" />);
    fireEvent.change(screen.getByLabelText('Your stake'), { target: { value: '1.234' } });
    expect(onChange).toHaveBeenCalledWith('1.23');
  });

  it('blocks characters that can never make an amount', () => {
    render(<MoneyInput value="" onChange={vi.fn()} label="Your stake" />);
    const input = screen.getByLabelText('Your stake');
    for (const key of ['e', 'E', '+', '-', ',']) {
      const event = fireEvent.keyDown(input, { key });
      // fireEvent returns false when preventDefault was called.
      expect(event).toBe(false);
    }
  });

  it('exposes the error to assistive technology', () => {
    render(
      <MoneyInput
        value="0"
        onChange={vi.fn()}
        label="Your stake"
        error="Minimum stake is 1 USDC."
      />,
    );
    const input = screen.getByLabelText('Your stake');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Minimum stake is 1 USDC.');
  });

  it('offers a numeric keypad on phones', () => {
    render(<MoneyInput value="" onChange={vi.fn()} label="Your stake" />);
    expect(screen.getByLabelText('Your stake')).toHaveAttribute('inputmode', 'decimal');
  });
});
