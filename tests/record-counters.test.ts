import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import {
  bumpVisibleRecordCount,
  getVisibleRecordCount,
  resetRecordCounters,
} from '../src/lib/record-counters.js';

describe('record counters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the database count once and reuses it', async () => {
    const count = vi.spyOn(prisma.dish, 'count').mockResolvedValue(42);

    expect(await getVisibleRecordCount('dish')).toBe(42);
    expect(await getVisibleRecordCount('dish')).toBe(42);

    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it('adjusts the cached total when records are created or deleted', async () => {
    const count = vi.spyOn(prisma.dish, 'count').mockResolvedValue(42);

    expect(await getVisibleRecordCount('dish')).toBe(42);
    bumpVisibleRecordCount('dish', 1);
    expect(await getVisibleRecordCount('dish')).toBe(43);
    bumpVisibleRecordCount('dish', -2);
    expect(await getVisibleRecordCount('dish')).toBe(41);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('never goes below zero', async () => {
    vi.spyOn(prisma.chef, 'count').mockResolvedValue(0);

    expect(await getVisibleRecordCount('chef')).toBe(0);
    bumpVisibleRecordCount('chef', -1);
    expect(await getVisibleRecordCount('chef')).toBe(0);
  });

  it('recounts after a reset', async () => {
    const count = vi.spyOn(prisma.ingredient, 'count').mockResolvedValue(10);

    expect(await getVisibleRecordCount('ingredient')).toBe(10);
    resetRecordCounters();
    count.mockResolvedValue(12);

    expect(await getVisibleRecordCount('ingredient')).toBe(12);
    expect(count).toHaveBeenCalledTimes(2);
  });
});
