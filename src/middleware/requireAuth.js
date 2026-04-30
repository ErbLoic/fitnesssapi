const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

module.exports = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalide ou expire' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isDisabled: true, isSystem: true },
    });
    if (!user || user.isDisabled || user.isSystem) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Compte inactif ou supprime' });
    }
    req.userId = payload.sub;
    req.userEmail = user.email || payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalide ou expire' });
  }
};
