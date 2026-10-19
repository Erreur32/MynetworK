/** Random number in [0, 1) from the Web Crypto API, used for timing jitter. */
export function randomFraction(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
