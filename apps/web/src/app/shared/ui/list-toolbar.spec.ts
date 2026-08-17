import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { ListToolbar, type SortOption } from './list-toolbar';

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'title', label: 'Title', defaultDir: 'asc' },
  { value: 'updated', label: 'Recently updated', defaultDir: 'desc' },
];

describe('ListToolbar', () => {
  it('toggling the direction button flips sortDir without touching sortValue', () => {
    const fixture = TestBed.createComponent(ListToolbar);
    fixture.componentRef.setInput('sortOptions', SORT_OPTIONS);
    fixture.componentRef.setInput('sortValue', 'title');
    fixture.componentRef.setInput('sortDir', 'asc');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.sortDir()).toBe('desc');
    expect(fixture.componentInstance.sortValue()).toBe('title');
  });

  it("picking a different sort field resets sortDir to that option's default", async () => {
    const fixture = TestBed.createComponent(ListToolbar);
    fixture.componentRef.setInput('sortOptions', SORT_OPTIONS);
    fixture.componentRef.setInput('sortValue', 'title');
    fixture.componentRef.setInput('sortDir', 'asc');
    fixture.detectChanges();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const select = await loader.getHarness(MatSelectHarness);
    await select.clickOptions({ text: 'Recently updated' });
    fixture.detectChanges();

    expect(fixture.componentInstance.sortValue()).toBe('updated');
    expect(fixture.componentInstance.sortDir()).toBe('desc');
  });

  it("the direction button's aria-label describes the action it performs", () => {
    const fixture = TestBed.createComponent(ListToolbar);
    fixture.componentRef.setInput('sortOptions', SORT_OPTIONS);
    fixture.componentRef.setInput('sortValue', 'title');
    fixture.componentRef.setInput('sortDir', 'asc');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-label')).toBe('Sort descending');

    fixture.componentRef.setInput('sortDir', 'desc');
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Sort ascending');
  });

  it('does not render a direction button when there are no sort options', () => {
    const fixture = TestBed.createComponent(ListToolbar);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
  });
});
