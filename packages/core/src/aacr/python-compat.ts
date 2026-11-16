/**
 * The two pieces of CPython the official AACR-Bench tooling leans on, ported
 * so Komodo's numbers line up with it exactly.
 *
 * `PythonRandom.shuffle` is `random.Random(seed).shuffle` — the converter
 * shuffles every record with it before `--limit`, so `--seed 42 --limit 20`
 * picks the same twenty pull requests here as there. `pyRound` is Python's
 * `round()`, which rounds an exact tie to even (`round(0.0625, 3)` is 0.062)
 * where `toFixed` would round it up; a precision of 1/16 is an ordinary
 * result, so the difference is not academic.
 */

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

/** MT19937 seeded the way CPython seeds `random.Random(int)`. */
export class PythonRandom {
  private readonly mt = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new Error(`seed must be a safe integer, got ${seed}`);
    // CPython: abs(seed), split into 32-bit words, least significant first;
    // zero is the one-word key [0].
    let n = BigInt(Math.abs(seed));
    const key: number[] = [];
    while (n > 0n) {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    }
    if (!key.length) key.push(0);
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: number[]): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) >>> 0) + key[j] + j;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) >>> 0) - i;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  /** genrand_uint32. */
  nextUint32(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      let kk = 0;
      for (; kk < N - M; kk++) {
        const y = (mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      const y = (mt[N - 1] & UPPER_MASK) | (mt[0] & LOWER_MASK);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** `getrandbits(k)` for 1 <= k <= 32. */
  getrandbits(k: number): number {
    if (k < 1 || k > 32) throw new Error(`getrandbits supports 1..32 bits, got ${k}`);
    return this.nextUint32() >>> (32 - k);
  }

  /** `_randbelow_with_getrandbits(n)`. */
  randbelow(n: number): number {
    if (n <= 0) return 0;
    const k = 32 - Math.clz32(n); // n.bit_length()
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  /** `random.shuffle(x)` in place: Fisher–Yates from the end. */
  shuffle<T>(x: T[]): T[] {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      const tmp = x[i];
      x[i] = x[j];
      x[j] = tmp;
    }
    return x;
  }
}

/**
 * Python's `round(x, ndigits)` for finite floats.
 *
 * Both round the exact binary value of `x`; they differ only on an exact tie,
 * which Python sends to the even neighbour. A double is an exact tie at
 * `ndigits` only when it is an odd multiple of 2^-(ndigits+1) — the 5^ndigits
 * in 10^ndigits has to cancel — and multiplying by a power of two is exact,
 * so the test below is exact too.
 */
export function pyRound(x: number, ndigits = 0): number {
  if (!Number.isFinite(x)) return x;
  const twice = x * 2 ** (ndigits + 1);
  if (Number.isInteger(twice) && Math.abs(twice) % 2 === 1) {
    const scale = 10 ** ndigits;
    const lo = Math.floor(x * scale);
    const even = lo % 2 === 0 ? lo : lo + 1;
    return even / scale;
  }
  return Number(x.toFixed(ndigits));
}
