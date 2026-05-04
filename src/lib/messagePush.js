const prisma = require('./prisma');
const { getFirebaseAdmin } = require('./firebaseAdmin');

function truncateNotificationBody(body) {
  const fallback = 'Nouveau message';
  const text = (body || '').trim() || fallback;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

async function disableInvalidTokens(tokens, response) {
  const invalidTokens = [];

  response.responses.forEach((result, index) => {
    if (result.success) return;

    const code = result.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      invalidTokens.push(tokens[index].token);
    }
  });

  if (invalidTokens.length === 0) return;

  await prisma.pushToken.updateMany({
    where: { token: { in: invalidTokens } },
    data: { enabled: false },
  });
}

async function sendMessagePush(params) {
  const admin = getFirebaseAdmin();
  if (!admin) {
    console.warn('[PUSH] Firebase Admin non configure, push message ignoree');
    return { skipped: true, reason: 'FIREBASE_NOT_CONFIGURED' };
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: params.recipientUserId },
    select: { notifMessages: true },
  });
  if (settings && settings.notifMessages === false) {
    return { skipped: true, reason: 'MESSAGES_DISABLED' };
  }

  const tokens = await prisma.pushToken.findMany({
    where: {
      userId: params.recipientUserId,
      enabled: true,
    },
    select: { token: true },
  });

  if (tokens.length === 0) return { skipped: true, reason: 'NO_TOKENS' };

  const response = await admin.messaging().sendEachForMulticast({
    tokens: tokens.map((item) => item.token),
    notification: {
      title: `Message de ${params.senderName}`,
      body: truncateNotificationBody(params.body),
    },
    data: {
      type: 'message',
      conversationId: String(params.conversationId),
      messageId: String(params.messageId),
      senderId: String(params.senderId),
      senderName: String(params.senderName || ''),
      createdAt: params.createdAt.toISOString(),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'fitness_messages',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  });

  await disableInvalidTokens(tokens, response);
  return { successCount: response.successCount, failureCount: response.failureCount };
}

module.exports = { sendMessagePush };
