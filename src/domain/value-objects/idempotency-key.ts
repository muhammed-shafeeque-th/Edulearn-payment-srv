import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

export class IdempotencyKey {
  private readonly value: string;

  constructor(value?: string) {
    this.validate(value);
    const key = value || uuidv4();

    this.value = key;
  }
  private validate(key?: string): void {
    if (!uuidValidate(key)) {
      throw new Error('Invalid idempotency key format');
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: IdempotencyKey): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
