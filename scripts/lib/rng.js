function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float(min, max) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
  chance(p) {
    return this.next() < p;
  }
}

module.exports = { Rng, mulberry32 };
