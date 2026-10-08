import { render } from 'preact';
import { App } from './App';
import css from './styles.css?inline';
import type { PanelProps } from './types';

export interface PanelHandle {
  /** Odświeża panel nowymi danymi (np. po skanie albo zmianie postępu). */
  update(props: PanelProps): void;
  unmount(): void;
}

/**
 * Montuje panel w Shadow DOM elementu `host` – style gry nie wpływają na panel i odwrotnie.
 * Panel nie dotyka niczego poza swoim hostem.
 */
export function mount(host: HTMLElement, props: PanelProps): PanelHandle {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const style = document.createElement('style');
  style.textContent = css;
  const root = document.createElement('div');
  root.className = 'kp-root';
  shadow.append(style, root);
  render(<App {...props} />, root);
  return {
    update: (next) => render(<App {...next} />, root),
    unmount: () => {
      render(null, root);
      shadow.replaceChildren();
    },
  };
}
