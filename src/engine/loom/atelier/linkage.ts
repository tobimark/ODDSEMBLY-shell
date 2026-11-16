export interface Point { x: number; y: number }
/** Circle intersection for a fixed-pivot servo crank and a rigid connecting rod.
 * Slider position is the command; crank angle is solved, never independently animated. */
export function solveLinkage(center: Point, slider: Point, crank = 25, rod = 75) {
  const dx = slider.x - center.x, dy = slider.y - center.y, d = Math.hypot(dx, dy);
  if (d <= Math.abs(rod - crank) || d >= rod + crank) throw new Error('Unreachable or singular linkage');
  const a = (crank * crank - rod * rod + d * d) / (2 * d);
  const h = Math.sqrt(crank * crank - a * a);
  const pin = { x: center.x + a * dx / d - h * dy / d, y: center.y + a * dy / d + h * dx / d };
  return { center, pin, slider, crank, rod, angle: Math.atan2(pin.y-center.y,pin.x-center.x) };
}
