// Seeded random numbers (mulberry32), so the same seed and settings replay the same run.

export function createRng(seed) {
  let s = seed >>> 0;
  let spare = null;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int: (n) => Math.floor(next() * n),
    gaussian() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u = 0;
      while (u === 0) u = next();
      const r = Math.sqrt(-2 * Math.log(u));
      const a = 2 * Math.PI * next();
      spare = r * Math.sin(a);
      return r * Math.cos(a);
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 1e9);
}
