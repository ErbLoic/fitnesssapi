const UNKNOWN_USER_ID = '00000000-0000-0000-0000-000000000000';
const UNKNOWN_USER_NAME = 'Utilisateur inconnu';

function addYears(date, years) {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

async function ensureUnknownUser(tx) {
  return tx.user.upsert({
    where: { id: UNKNOWN_USER_ID },
    update: {
      email: null,
      passwordHash: null,
      name: UNKNOWN_USER_NAME,
      profileImageUrl: null,
      isDisabled: true,
      isSystem: true,
      onboardingComplete: true,
    },
    create: {
      id: UNKNOWN_USER_ID,
      email: null,
      passwordHash: null,
      name: UNKNOWN_USER_NAME,
      isDisabled: true,
      isSystem: true,
      onboardingComplete: true,
      settings: { create: {} },
    },
  });
}

async function moveConversationParticipantsToUnknown(tx, userId) {
  const participants = await tx.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });

  for (const participant of participants) {
    const unknownParticipant = await tx.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: participant.conversationId,
          userId: UNKNOWN_USER_ID,
        },
      },
    });

    if (unknownParticipant) {
      await tx.conversationParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId: participant.conversationId,
            userId,
          },
        },
      });
      continue;
    }

    await tx.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: participant.conversationId,
          userId,
        },
      },
      data: { userId: UNKNOWN_USER_ID },
    });
  }
}

async function deactivateAccount(prisma, userId) {
  const now = new Date();
  const scheduledDeletionAt = addYears(now, 2);

  return prisma.$transaction(async (tx) => {
    await ensureUnknownUser(tx);

    await tx.message.updateMany({
      where: { senderId: userId },
      data: { senderId: UNKNOWN_USER_ID },
    });
    await moveConversationParticipantsToUnknown(tx, userId);

    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.oauthProvider.deleteMany({ where: { userId } });
    await tx.pushToken.deleteMany({ where: { userId } });
    await tx.friendship.deleteMany({
      where: { OR: [{ requesterId: userId }, { receiverId: userId }] },
    });

    return tx.user.update({
      where: { id: userId },
      data: {
        email: null,
        passwordHash: null,
        name: UNKNOWN_USER_NAME,
        age: null,
        heightCm: null,
        weightKg: null,
        gender: null,
        profileImageUrl: null,
        isBanned: false,
        isDisabled: true,
        deactivatedAt: now,
        scheduledDeletionAt,
        onboardingComplete: false,
      },
      select: { id: true, deactivatedAt: true, scheduledDeletionAt: true },
    });
  });
}

async function purgeExpiredDisabledAccounts(prisma, now = new Date()) {
  return prisma.user.deleteMany({
    where: {
      isDisabled: true,
      isSystem: false,
      scheduledDeletionAt: { lte: now },
    },
  });
}

module.exports = {
  UNKNOWN_USER_ID,
  UNKNOWN_USER_NAME,
  ensureUnknownUser,
  deactivateAccount,
  purgeExpiredDisabledAccounts,
};
