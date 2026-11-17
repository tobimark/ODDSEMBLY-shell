/** Precision Flat Mechanical — design pixels, shared by both subsystems. */
export const FINISH = {
  paper: '#FBF9F6', enamel: '#F5F3EC', steel: '#E8E8E0', recess: '#DEDCD2',
  edge: '#A9A294', fine: '#CDC7B8', ink: '#A8A08E', muted: '#847B6E',
  accent: '#33CBCC', shadow: '#7A6F620D', highlight: '#FFFDF8',
  outline: .75, hairline: .45, datum: 1.1, relief: 1.2,
} as const;
export const MOUNT = { x: 90, y: 35, scale: 1.06 } as const;
export const machinePoint = (x: number, y: number) => ({ x: MOUNT.x + x*MOUNT.scale, y: MOUNT.y + y*MOUNT.scale });
