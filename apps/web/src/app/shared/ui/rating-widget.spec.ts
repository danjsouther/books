import { TestBed } from '@angular/core/testing';
import { RatingWidget } from './rating-widget';

describe('RatingWidget', () => {
  it('renders eleven radios, each labelled "Rate N out of 10"', () => {
    const fixture = TestBed.createComponent(RatingWidget);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(11);
    expect(radios[0]?.getAttribute('aria-label')).toBe('Rate 0 out of 10');
    expect(radios[10]?.getAttribute('aria-label')).toBe('Rate 10 out of 10');
  });

  it('selecting a radio updates value()', () => {
    const fixture = TestBed.createComponent(RatingWidget);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[7]!.checked = true;
    radios[7]!.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe(7);
  });

  it('Clear rating sets value() back to null', () => {
    const fixture = TestBed.createComponent(RatingWidget);
    fixture.componentRef.setInput('value', 5);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBeNull();
  });
});
