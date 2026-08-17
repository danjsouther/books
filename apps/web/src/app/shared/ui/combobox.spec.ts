import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { AppCombobox } from './combobox';

describe('AppCombobox', () => {
  it('shows every option label, and updates value/query once one is chosen', async () => {
    const fixture = TestBed.createComponent(AppCombobox);
    fixture.componentRef.setInput('options', [{ id: 'a', label: 'The Expanse' }]);
    fixture.detectChanges();
    await fixture.whenStable();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const autocomplete = await loader.getHarness(MatAutocompleteHarness);
    await autocomplete.enterText('e');
    fixture.detectChanges();
    await fixture.whenStable();

    const options = await autocomplete.getOptions();
    expect(await Promise.all(options.map((o) => o.getText()))).toEqual(['The Expanse']);

    await autocomplete.selectOption({ text: 'The Expanse' });
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('a');
    expect(fixture.componentInstance.queryText()).toBe('The Expanse');
  });

  // The regression a static-options test can't catch: the bug only fires
  // when the array changes underneath a half-typed query — i.e. on every
  // result of an async search. See `select.spec.ts` for the sibling case.
  it('does not select or rewrite the query when async results arrive mid-typing', async () => {
    const fixture = TestBed.createComponent(AppCombobox);
    fixture.componentRef.setInput('options', []);
    fixture.detectChanges();
    await fixture.whenStable();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const autocomplete = await loader.getHarness(MatAutocompleteHarness);
    await autocomplete.enterText('storm');
    fixture.detectChanges();
    await fixture.whenStable();

    // The search comes back — a brand-new array, exactly as `httpResource` hands
    // one over on every keystroke.
    fixture.componentRef.setInput('options', [
      { id: 'a', label: 'The Stormlight Archive' },
      { id: 'b', label: 'Stormbringer' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBeNull();
    expect(fixture.componentInstance.queryText()).toBe('storm');
    expect(await autocomplete.getValue()).toBe('storm');
    const options = await autocomplete.getOptions();
    expect(options.length).toBe(2);
  });

  it('shows a loading placeholder while searching with no results yet', async () => {
    const fixture = TestBed.createComponent(AppCombobox);
    fixture.componentRef.setInput('options', []);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const autocomplete = await loader.getHarness(MatAutocompleteHarness);
    await autocomplete.enterText('storm');
    fixture.detectChanges();
    await fixture.whenStable();

    const options = await autocomplete.getOptions();
    expect(await options[0]?.getText()).toBe('Searching…');
  });

  it('puts its id on the inner input, so a label can point at it', async () => {
    const fixture = TestBed.createComponent(AppCombobox);
    fixture.componentRef.setInput('options', []);
    fixture.componentRef.setInput('inputId', 'series');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('input#series')).toBeTruthy();
  });
});
