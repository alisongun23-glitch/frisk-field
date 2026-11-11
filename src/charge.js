// Energy rules: what two particles do to each other follows from their Energy_levels alone.

// The energy it takes to bond these levels. Opposite charges and levels far enough apart, like 1 and 10, bond for free.
// Past that the cost climbs as the levels get closer, up to `cost` for an exact match.
export function bondEnergy(a, b, cost, freeGap) {
  if (a * b < 0) return 0;
  const gap = Math.abs(a - b);
  return gap >= freeGap ? 0 : cost * (1 - gap / freeGap);
}

// How a particle with energy `net` feels about one with Energy_level `other`, from -1 to 1. An opposite charge pulls
// harder the closer it comes to cancelling `net` exactly. The same sign pushes hardest at a matching level and fades
// toward the free gap, past which the two can bond for nothing, so it pulls instead.
export function chargePull(net, other, freeGap) {
  if (net * other === 0) return 0;
  const a = Math.abs(net);
  const b = Math.abs(other);
  if (net * other < 0) return Math.min(a, b) / Math.max(a, b);
  const gap = Math.abs(a - b);
  return gap >= freeGap ? 0.5 : gap / freeGap - 1;
}
