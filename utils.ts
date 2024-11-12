export class LimitedMap extends Map {
  limit: number;
  keysArray: unknown[];
  constructor(limit = 100) {
    super();
    this.limit = limit;
    this.keysArray = [];
  }

  override set(key: unknown, value: unknown) {
    if (this.size >= this.limit) {
      const oldestKey = this.keysArray.shift();
      this.delete(oldestKey);
    }

    if (!this.has(key)) {
      this.keysArray.push(key);
    }

    return super.set(key, value);
  }
}
