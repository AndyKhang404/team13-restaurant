import { prisma } from '../src/lib/prisma.js';

async function main() {
  const users = await prisma.profile.findMany({
    take: 5,
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      displayName: true,
      role: true,
      status: true,
      passwordHash: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const sessions = await prisma.session.findMany({
    take: 5,
    select: {
      id: true,
      userId: true,
      sidHash: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const challenges = await prisma.activationChallenge.findMany({
    take: 5,
    select: {
      id: true,
      userId: true,
      purpose: true,
      otpHash: true,
      attempts: true,
      lockedUntil: true,
      lastSentAt: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  const resets = await prisma.passwordReset.findMany({
    take: 5,
    select: {
      id: true,
      userId: true,
      email: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('=== USERS (PROFILES) ===');
  console.log(JSON.stringify(users, null, 2));
  console.log('\n=== SESSIONS ===');
  console.log(JSON.stringify(sessions, null, 2));
  console.log('\n=== ACTIVATION CHALLENGES ===');
  console.log(JSON.stringify(challenges, null, 2));
  console.log('\n=== PASSWORD RESETS ===');
  console.log(JSON.stringify(resets, null, 2));
}

main().catch(console.error);
