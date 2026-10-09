// Keeping the layout inside the visible area on phones. iOS doesn't
// shrink the layout viewport when the keyboard opens; it scrolls the
// page instead, pushing the header off screen and leaving the composer
// half hidden. Size the app to the visual viewport, keep the document
// from scrolling, and mark the keyboard as open so the home-indicator
// inset can be dropped while it's up.

const KEYBOARD_PX = 120;

export function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    // pinch zoom (desktop browsers) changes vv too; leave the layout be
    if (vv.scale > 1.01) return;
    root.style.setProperty(
      '--app-height',
      `${Math.round(vv.height)}px`,
    );
    root.toggleAttribute(
      'data-keyboard',
      window.innerHeight - vv.height > KEYBOARD_PX,
    );
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

/** Put the keyboard away (phones): blur whatever text field has focus. */
export function dismissKeyboard() {
  const el = document.activeElement;
  if (
    el instanceof HTMLElement &&
    (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
  ) {
    el.blur();
  }
}
