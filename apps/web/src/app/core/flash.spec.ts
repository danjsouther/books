import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Flash } from './flash';

describe('Flash', () => {
  it('shows a message via the snack bar', () => {
    const flash = TestBed.inject(Flash);
    const snackBar = TestBed.inject(MatSnackBar);
    const openSpy = vi.spyOn(snackBar, 'open').mockReturnValue({
      onAction: () => ({ subscribe: () => undefined }),
    } as never);

    flash.show('Saved.');

    expect(openSpy).toHaveBeenCalledWith('Saved.', undefined, { duration: 8000 });
  });

  it('runs undo when the action is triggered', () => {
    const flash = TestBed.inject(Flash);
    const snackBar = TestBed.inject(MatSnackBar);
    const undo = vi.fn();
    let actionCallback: (() => void) | undefined;
    vi.spyOn(snackBar, 'open').mockReturnValue({
      onAction: () => ({
        subscribe: (cb: () => void) => {
          actionCallback = cb;
        },
      }),
    } as never);

    flash.show('Deleted.', undo);
    actionCallback?.();

    expect(undo).toHaveBeenCalled();
  });

  it('clear() dismisses the snack bar', () => {
    const flash = TestBed.inject(Flash);
    const snackBar = TestBed.inject(MatSnackBar);
    const dismissSpy = vi.spyOn(snackBar, 'dismiss');

    flash.clear();

    expect(dismissSpy).toHaveBeenCalled();
  });
});
