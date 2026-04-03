const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('./prisma');

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const days = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '30');
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  return token;
}

module.exports = { issueAccessToken, issueRefreshToken };
