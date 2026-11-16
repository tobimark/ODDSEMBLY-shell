import { bolt, label, line, plate, rect, surface } from './drawing';
import { FINISH as F, machinePoint } from './finish';

/** Shared stationary chassis. These are enclosure mounts, not drive links. */
export function sharedChassis() {
  return surface(1472,1008,g=>{
    const post = machinePoint(311,490);
    // Tangential saddle clamps the OUTER stationary scale housing to the loom frame.
    const a=42*Math.PI/180, x=-610+Math.cos(a)*1312, y=-390+Math.sin(a)*1312;
    plate(g,x-3,post.y-7,post.x-x+20,18,false,false);
    for(let px=x+27;px<post.x-15;px+=30) rect(g,px,post.y-2,16,4,F.recess,2,F.fine);
    g.save();g.translate(x,y);g.rotate(a+Math.PI/2);
    plate(g,-32,-14,64,28,false,false);for(const px of [-23,23]){bolt(g,px,-6,2.6);bolt(g,px,6,2.6);}g.restore();
    plate(g,post.x-17,post.y-18,34,36,false,false);bolt(g,post.x-10,post.y-10);bolt(g,post.x+10,post.y+10);
    // Console feet fasten into the same full-width bed as the loom feet.
    for(const px of [106,310]) {
      plate(g,px-9,775,18,73,false,false);
      rect(g,px-3,799,6,27,F.recess,3,F.fine);bolt(g,px,790,2.6);bolt(g,px,840,2.6);
    }
    plate(g,79,840,1326,30,false,false);
    line(g,[90,847,1393,847],F.fine,.5);line(g,[90,864,1393,864],F.fine,.6);
    for(const px of [96,325,520,830,1130,1388]){bolt(g,px,855,3);}
    for(const px of [107,530,1350]){rect(g,px-16,870,32,4,F.steel,1,F.edge);line(g,[px-22,876,px+22,876],F.fine,.5);}
    // Bolted service spine between cabinet and drive cassette, behind both covers.
    plate(g,333,739,57,23,false,false);bolt(g,344,750,2.6);bolt(g,379,750,2.6);
    label(g,'KM / 01   •   EVENT-TO-WEAVE ASSEMBLY',980,859,7,F.muted,'center');
    label(g,'M04 / FIXED HOUSING SADDLE',392,459,6,F.muted);
  });
}
