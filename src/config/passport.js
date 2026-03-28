const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Local ─────────────────────────────────────────────────────────
passport.use(new LocalStrategy(
  { usernameField: 'email', passwordField: 'password' },
  async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return done(null, false);
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) return done(null, false);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ── Google OAuth ──────────────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await upsertOAuthUser(profile, 'google', accessToken, refreshToken);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ── GitHub OAuth ──────────────────────────────────────────────────
passport.use(new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await upsertOAuthUser(profile, 'github', accessToken, refreshToken);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ── Facebook OAuth ────────────────────────────────────────────────
passport.use(new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails', 'photos'],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await upsertOAuthUser(profile, 'facebook', accessToken, refreshToken);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

async function upsertOAuthUser(profile, provider, accessToken, refreshToken) {
  const providerId = profile.id;
  const email = profile.emails?.[0]?.value || null;
  const name = profile.displayName || profile.username || 'User';
  const profileImageUrl = profile.photos?.[0]?.value || null;

  const existing = await prisma.oauthProvider.findUnique({
    where: { provider_providerId: { provider, providerId } },
    include: { user: true },
  });

  if (existing) {
    await prisma.oauthProvider.update({
      where: { id: existing.id },
      data: { accessToken, refreshToken },
    });
    return existing.user;
  }

  // Check if user with same email exists
  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        profileImageUrl,
        settings: { create: {} },
      },
    });
  }

  await prisma.oauthProvider.create({
    data: { userId: user.id, provider, providerId, accessToken, refreshToken },
  });

  return user;
}
