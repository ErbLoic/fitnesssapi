const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.__fitnessPrisma || new PrismaClient();

if (process.env.NODE_ENV === 'production') {
  globalForPrisma.__fitnessPrisma = prisma;
} else if (!globalForPrisma.__fitnessPrisma) {
  globalForPrisma.__fitnessPrisma = prisma;
}

module.exports = prisma;
