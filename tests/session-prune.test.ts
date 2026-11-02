import { describe, it, expect, vi, beforeEach } from 'vitest';

const { deleteMany } = vi.hoisted(() => ({ deleteMany: vi.fn() }));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: { session: { deleteMany } },
}));

import { pruneSessions, SESSION_TTL_MS } from '../src/auth/session.js';

describe('pruneSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMany.mockResolvedValue({ count: 0 });
  });

  it('deletes sessions that are expired or revoked past the retention window', async () => {
    deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-11-02T12:00:00.000Z');

    const count = await pruneSessions(now);

    expect(count).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { revokedAt: { not: null, lte: new Date(now.getTime() - SESSION_TTL_MS) } },
        ],
      },
    });
  });

  it('does nothing harmful when there is nothing to delete', async () => {
    const count = await pruneSessions(new Date(Date.now()));
    expect(count).toBe(0);
  });
});