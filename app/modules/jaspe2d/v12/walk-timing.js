// Shared timing for the photos and their existing secondary accompaniment.
// These are still V12 prototype poses; cadence does not certify visual realism.
export const walkCycle = Object.freeze([
  ['walkHalfL',190],['walkL',220],['walkHalfL',240],['walkRest',110],
  ['walkHalfR',190],['walkR',220],['walkHalfR',240],['walkRest',110],
].map(step=>Object.freeze(step)));
export const walkCycleDuration=walkCycle.reduce((total,[,ms])=>total+ms,0);
export function walkRhythm(elapsed,progress){
  const phase=2*Math.PI*elapsed/walkCycleDuration;
  const envelope=Math.sin(Math.PI*Math.max(0,Math.min(1,progress)))**2;
  return {transfer:Math.sin(phase)*envelope,cloth:Math.sin(phase-.35)*envelope};
}
