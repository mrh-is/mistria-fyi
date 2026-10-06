import confetti from "canvas-confetti";

import { confettiColors } from "#lib/utils/palette.js";

/** Fire a confetti burst for milestone completions (sections, categories). */
export function celebrate(): void {
  void confetti({
    colors: confettiColors([1, 2, 3, 4, 5]),
    decay: 0.9,
    disableForReducedMotion: true,
    gravity: 1.2,
    origin: { x: 0.5, y: 0.7 },
    particleCount: 80,
    spread: 70,
    startVelocity: 30,
    ticks: 120,
  });
}

/** Fire a bigger confetti burst for category-level completions. */
export function celebrateCategory(): void {
  const defaults = {
    colors: confettiColors([1, 2, 3, 4, 6, 7]),
    decay: 0.92,
    disableForReducedMotion: true,
    gravity: 1,
    ticks: 150,
  };

  void confetti({
    ...defaults,
    angle: 60,
    origin: { x: 0, y: 0.7 },
    particleCount: 60,
    spread: 55,
    startVelocity: 40,
  });
  void confetti({
    ...defaults,
    angle: 120,
    origin: { x: 1, y: 0.7 },
    particleCount: 60,
    spread: 55,
    startVelocity: 40,
  });
}
