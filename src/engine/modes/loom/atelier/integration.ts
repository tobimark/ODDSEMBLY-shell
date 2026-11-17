import { bolt, label, line, plate, rect, surface } from './drawing';
import { FINISH as F } from './finish';

/** Shared stationary chassis: only the bed under the loom remains. The old
 *  console feet, saddle and service spine were removed with the control box. */
export function sharedChassis() {
  return surface(1472, 1008, g => {
    plate(g, 480, 921, 990, 30, false, false);
    line(g, [492, 928, 1458, 928], F.fine, .5);
    line(g, [492, 945, 1458, 945], F.fine, .6);
    for (const px of [500, 700, 900, 1100, 1440]) bolt(g, px, 936, 3);
    for (const px of [650, 1350]) {
      rect(g, px - 16, 951, 32, 4, F.steel, 1, F.edge);
      line(g, [px - 22, 957, px + 22, 957], F.fine, .5);
    }
    label(g, 'KM / 01   •   EVENT-TO-WEAVE ASSEMBLY', 960, 940, 7, F.muted, 'center');
  });
}
