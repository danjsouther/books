import { TestBed } from '@angular/core/testing';
import { RatingWidget } from './rating-widget';

describe('RatingWidget', () => {
  it('renders eleven toggles, each labelled "Rate N out of 10"', () => {
    const fixture = TestBed.createComponent(RatingWidget);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggles = el.querySelectorAll<HTMLElement>('[role="radio"]');
    expect(toggles).toHaveLength(11);
    expect(toggles[0]?.getAttribute('aria-label')).toBe('Rate 0 out of 10');
    expect(toggles[10]?.getAttribute('aria-label')).toBe('Rate 10 out of 10');
  });

  it('selecting a toggle updates value()', () => {
    const fixture = TestBed.createComponent(RatingWidget);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggles = el.querySelectorAll<HTMLElement>('[role="radio"]');
    toggles[7]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe(7);
  });

  it('Clear rating sets value() back to null', () => {
    const fixture = TestBed.createComponent(RatingWidget);
    fixture.componentRef.setInput('value', 5);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.clear')?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBeNull();
  });
});
