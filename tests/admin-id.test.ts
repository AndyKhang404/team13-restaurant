import { describe, it, expect } from 'vitest';
import { paramId } from '../src/lib/admin.js';
import { HttpError } from '../src/lib/http.js';

const UUID = '11111111-1111-4111-8111-111111111111';

// Regression: garbage :id values used to reach Prisma (malformed UUID ->
// PrismaClientValidationError -> 500). They must become 404 instead.
describe('paramId', () => {
  it('passes a valid UUID through', () => {
    expect(paramId(UUID)).toBe(UUID);
  });

  it('takes the first value of an array param', () => {
    expect(paramId([UUID, 'other'])).toBe(UUID);
  });

  it('throws 404 for garbage ids', () => {
    for (const bad of ['abc', '', '123', '11111111-1111-4111-8111', 'null', 'undefined']) {
      try {
        paramId(bad);
        expect.unreachable(`paramId(${JSON.stringify(bad)}) should throw`);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpError);
        expect((e as HttpError).status).toBe(404);
      }
    }
  });
});
