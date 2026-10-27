// Contact shadows are re-rendered only when something asks for it (docs/06 section 2; BACKLOG "frames=1 once
// anything can move"). Static geometry invalidates once after it appears; actors (step 7) call `invalidate()` when
// they move, and the layer re-renders at most `maxHz` times per second for its quality tier.

let seq = 0;

export const contactShadows = {
  /** Request a re-render of the contact shadows on a coming frame. Cheap; safe to call often. */
  invalidate(): void {
    seq++;
  },
  /** Current request number (the layer compares it with the last one it rendered). */
  get seq(): number {
    return seq;
  },
};
