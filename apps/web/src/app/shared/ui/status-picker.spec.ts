import { TestBed } from '@angular/core/testing';
import { StatusPicker } from './status-picker';

describe('StatusPicker', () => {
  it('renders one radio per status, distinctly labelled', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(5);
    const values = Array.from(radios).map((r) => r.value);
    expect(values).toEqual(['plan', 'backlog', 'reading', 'completed', 'dropped']);
  });

  it('plan and backlog render visibly distinct chips, not just distinct values', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll('.chip'));
    const planChip = chips.find((c) => c.textContent?.includes('Plan'));
    const backlogChip = chips.find((c) => c.textContent?.includes('Backlog'));
    expect(planChip?.className).not.toBe(backlogChip?.className);
  });

  it('selecting a radio updates value()', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const reading = el.querySelector<HTMLInputElement>('input[value="reading"]');
    reading!.checked = true;
    reading!.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('reading');
  });
});
