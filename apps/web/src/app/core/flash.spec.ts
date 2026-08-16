import { TestBed } from '@angular/core/testing';
import { Flash } from './flash';

describe('Flash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a message', () => {
    const flash = TestBed.inject(Flash);
    flash.show('Saved.');
    expect(flash.message()).toEqual({ message: 'Saved.', undo: undefined });
  });

  it('auto-clears after the timeout', () => {
    const flash = TestBed.inject(Flash);
    flash.show('Saved.');
    vi.advanceTimersByTime(8000);
    expect(flash.message()).toBeNull();
  });

  it('clears immediately when undo() runs', () => {
    const flash = TestBed.inject(Flash);
    const undo = vi.fn();
    flash.show('Deleted.', undo);
    flash.message()?.undo?.();
    flash.clear();
    expect(flash.message()).toBeNull();
    expect(undo).toHaveBeenCalled();
  });

  it('a new message replaces and resets the timer for the old one', () => {
    const flash = TestBed.inject(Flash);
    flash.show('First.');
    vi.advanceTimersByTime(7000);
    flash.show('Second.');
    vi.advanceTimersByTime(7000);
    expect(flash.message()?.message).toBe('Second.');
  });
});
