import { TestBed } from '@angular/core/testing';
import { AppCombobox } from './combobox';

function typeInto(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

describe('AppCombobox', () => {
  it('forwards the listbox activedescendant onto the combobox input while navigating with the keyboard', async () => {
    const fixture = TestBed.createComponent(AppCombobox);
    fixture.componentRef.setInput('options', [
      { id: 'a', label: 'The Expanse' },
      { id: 'b', label: 'The Stormlight Archive' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[ngCombobox]');
    expect(input).toBeTruthy();
    input?.focus();

    // Typing is what opens the popup (a bare arrow key on a closed combobox
    // does not); arrowing afterward is what should make the listbox report an
    // active option, forwarded up onto the combobox's own input.
    typeInto(input!, 'e');
    fixture.detectChanges();
    await fixture.whenStable();

    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const activeDescendant = input?.getAttribute('aria-activedescendant');
    expect(activeDescendant).toBeTruthy();

    const highlighted = el.querySelector(`#${String(activeDescendant)}`);
    expect(highlighted).toBeTruthy();
    expect(highlighted?.textContent).toContain('The Expanse');
  });

  it('shows every option label, and updates value/query once one is chosen', async () => {
    const fixture = TestBed.createComponent(AppCombobox);
    fixture.componentRef.setInput('options', [{ id: 'a', label: 'The Expanse' }]);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[ngCombobox]');
    input?.focus();
    typeInto(input!, 'e');
    fixture.detectChanges();
    await fixture.whenStable();

    const option = el.querySelector<HTMLElement>('[role="option"]');
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe('a');
    expect(fixture.componentInstance.queryText()).toBe('The Expanse');
  });
});
