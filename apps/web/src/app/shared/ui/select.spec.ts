import { TestBed } from '@angular/core/testing';
import { AppSelect } from './select';

describe('AppSelect', () => {
  it('does not auto-select the first option on mount', () => {
    const fixture = TestBed.createComponent(AppSelect);
    fixture.componentRef.setInput('options', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBeNull();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-checked="true"]')).toBeNull();
  });

  it('selects an option on click', () => {
    const fixture = TestBed.createComponent(AppSelect);
    fixture.componentRef.setInput('options', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const optionB = Array.from(el.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (o) => o.textContent?.trim() === 'B',
    );
    optionB?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('b');
  });
});
