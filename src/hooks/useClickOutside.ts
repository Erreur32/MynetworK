import { useEffect } from 'react';
import type { RefObject } from 'react';

// mousedown (not click) so a toggle button's own onClick can still fire
// after the handler has closed the popup — the ref check excludes the button.
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const el = ref.current;
      const target = event.target;
      if (el && target instanceof Node && !el.contains(target)) {
        handler();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [ref, handler, enabled]);
}
