import { bolt, label, line, plate, rect, surface } from './drawing';
import { FINISH as F } from './finish';

/** Shared stationary chassis: only the bed under the loom remains. The old
 *  console feet, saddle and service spine were removed with the control box. */
export function sharedChassis() {
  return surface(1472, 1008, g => {
    plate(g, 462, 953, 918, 30, false, false);
    line(g, [474, 960, 1378, 960], F.fine, .5);
    line(g, [474, 977, 1378, 977], F.fine, .6);
    for (const px of [490, 690, 890, 1090, 1350]) bolt(g, px, 968, 3);
    for (const px of [650, 1260]) {
      rect(g, px - 16, 983, 32, 4, F.steel, 1, F.edge);
      line(g, [px - 22, 989, px + 22, 989], F.fine, .5);
    }
    label(g, 'ODDS / 01   •   EVENT-TO-WEAVE ASSEMBLY', 935, 972, 7, F.muted, 'center');
  });
}
