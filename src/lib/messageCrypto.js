const crypto = require('crypto');

const PREFIX = 'enc:v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) {
    if (isMessageEncryptionRequired()) {
      throw new Error('MESSAGE_ENCRYPTION_KEY is required when message encryption is required');
    }
    return null;
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('MESSAGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

function isMessageEncryptionRequired() {
  return String(
    process.env.MESSAGE_ENCRYPTION_REQUIRED || (process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  ).toLowerCase() === 'true';
}

function encryptMessageBody(body) {
  if (!body) return null;

  const key = getKey();
  if (!key) return body;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(String(body), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

function decryptMessageBody(body) {
  if (!body || typeof body !== 'string' || !body.startsWith(`${PREFIX}:`)) {
    return body;
  }

  const key = getKey();
  if (!key) {
    throw new Error('MESSAGE_ENCRYPTION_KEY is required to decrypt encrypted messages');
  }

  const parts = body.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted message format');
  }

  const [, , ivPart, tagPart, ciphertextPart] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function decryptMessage(message) {
  if (!message) return message;
  return { ...message, body: decryptMessageBody(message.body) };
}

module.exports = {
  encryptMessageBody,
  decryptMessageBody,
  decryptMessage,
  isMessageEncryptionRequired,
};
