import { TestBed } from '@angular/core/testing';
import { StatusPicker } from './status-picker';

describe('StatusPicker', () => {
  it('renders one toggle per status, distinctly labelled', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggles = el.querySelectorAll<HTMLElement>('[role="radio"]');
    expect(toggles).toHaveLength(6);
    const labels = Array.from(toggles).map((t) => t.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual([
      '📌 Plan',
      '📚 Backlog',
      '👀 Reading',
      '📥 Set Aside',
      '✅ Completed',
      '✖ Dropped',
    ]);
  });

  it('plan and backlog toggles carry visibly distinct status classes, not just distinct labels', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const plan = el.querySelector('.status-plan');
    const backlog = el.querySelector('.status-backlog');
    expect(plan).toBeTruthy();
    expect(backlog).toBeTruthy();
    expect(plan?.className).not.toBe(backlog?.className);
  });

  it('selecting a toggle updates value()', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggles = Array.from(el.querySelectorAll<HTMLElement>('[role="radio"]'));
    const reading = toggles.find((t) => t.textContent?.includes('Reading'));
    reading?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('reading');
  });

  it('re-clicking the active toggle deselects it', () => {
    const fixture = TestBed.createComponent(StatusPicker);
    fixture.componentRef.setInput('value', 'reading');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggles = Array.from(el.querySelectorAll<HTMLElement>('[role="radio"]'));
    const reading = toggles.find((t) => t.textContent?.includes('Reading'));
    reading?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBeNull();
  });
});
