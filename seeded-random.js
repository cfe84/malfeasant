const crypto = require('crypto');

/**
 * A deterministic seeded random number generator using SHA-256 hash
 */
class SeededRandom {
  /**
   * Create a seeded random number generator
   * @param {string} seed - Seed string for deterministic random generation
   */
  constructor(seed) {
    this.hash = crypto.createHash('sha256').update(seed).digest();
    this.index = 0;
  }

  /**
   * Generate a random number between 0 and 1
   * @returns {number} - Random number between 0 and 1
   */
  random() {
    if (this.index >= this.hash.length) {
      this.index = 0;
    }
    const value = this.hash[this.index] / 255;
    this.index++;
    return value;
  }

  /**
   * Generate a random integer between min (inclusive) and max (exclusive)
   * @param {number} min - Minimum value (inclusive)
   * @param {number} max - Maximum value (exclusive)
   * @returns {number} - Random integer
   */
  randomInt(min, max) {
    return Math.floor(this.random() * (max - min)) + min;
  }

  /**
   * Pick a random element from an array
   * @param {Array} array - Array to pick from
   * @returns {*} - Random element from the array
   */
  pick(array) {
    if (array.length === 0) return undefined;
    const index = this.randomInt(0, array.length);
    return array[index];
  }

  /**
   * Create a new SeededRandom instance with a different seed
   * @param {string} seed - New seed string
   * @returns {SeededRandom} - New SeededRandom instance
   */
  static create(seed) {
    return new SeededRandom(seed);
  }

  /**
   * Create a seeded random function (for backward compatibility)
   * @param {string} seed - Seed string
   * @returns {function} - Random function that returns 0-1
   */
  static createFunction(seed) {
    const seededRandom = new SeededRandom(seed);
    return () => seededRandom.random();
  }
}

module.exports = SeededRandom;
