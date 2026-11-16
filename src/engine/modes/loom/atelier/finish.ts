/** Precision Flat Mechanical — design pixels, shared by both subsystems. */
export const FINISH = {
  paper: '#FBF9F6', enamel: '#F5F3EC', steel: '#E8E8E0', recess: '#DEDCD2',
  edge: '#9A9E9E', fine: '#C4C6BE', ink: '#171C60', muted: '#78818A',
  accent: '#33CBCC', shadow: '#171C600D', highlight: '#FFFDF8',
  outline: .75, hairline: .45, datum: 1.1, relief: 1.2,
} as const;
export const MOUNT = { x: 151, y: 0, scale: 1 } as const;
export const machinePoint = (x: number, y: number) => ({ x: MOUNT.x + x*MOUNT.scale, y: MOUNT.y + y*MOUNT.scale });
