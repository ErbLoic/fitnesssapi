require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.appVersion.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      platform: 'android',
      latestVersion: '1.0.0',
      minRequiredVersion: '1.0.0',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.example.fitnessv2',
    },
  });

  await prisma.appVersion.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      platform: 'ios',
      latestVersion: '1.0.0',
      minRequiredVersion: '1.0.0',
      storeUrl: 'https://apps.apple.com/app/id000000000',
    },
  });

  // ── Badge definitions (28 badges, toutes catégories) ─────────────
  const badges = [
    // ── Entraînement (9) ──────────────────────────────────────────
    {
      badgeId: 'first_workout', name: 'Premier pas',
      description: 'Complétez votre premier entraînement',
      icon: '💪', color: '#2196F3', category: 'workout',
      conditionDescription: 'totalWorkouts >= 1',
    },
    {
      badgeId: '10_workouts', name: 'Régulier',
      description: 'Complétez 10 entraînements',
      icon: '🏋️', color: '#FF9800', category: 'workout',
      conditionDescription: 'totalWorkouts >= 10',
    },
    {
      badgeId: '25_workouts', name: 'Déterminé',
      description: 'Complétez 25 entraînements',
      icon: '🏋️', color: '#F57C00', category: 'workout',
      conditionDescription: 'totalWorkouts >= 25',
    },
    {
      badgeId: '50_workouts', name: 'Machine de guerre',
      description: 'Complétez 50 entraînements',
      icon: '🔥', color: '#F44336', category: 'workout',
      conditionDescription: 'totalWorkouts >= 50',
    },
    {
      badgeId: '100_workouts', name: 'Légende',
      description: 'Complétez 100 entraînements',
      icon: '👑', color: '#FFC107', category: 'workout',
      conditionDescription: 'totalWorkouts >= 100',
    },
    {
      badgeId: '1000_cal', name: 'Brûleur',
      description: 'Brûlez 1 000 calories au total',
      icon: '🔥', color: '#FF6D00', category: 'workout',
      conditionDescription: 'totalCaloriesBurned >= 1000',
    },
    {
      badgeId: '10000_cal', name: 'Fournaise',
      description: 'Brûlez 10 000 calories au total',
      icon: '♨️', color: '#F44336', category: 'workout',
      conditionDescription: 'totalCaloriesBurned >= 10000',
    },
    {
      badgeId: '1000_volume', name: 'Force brute',
      description: 'Soulevez 1 000 kg au total',
      icon: '🏋️', color: '#3F51B5', category: 'workout',
      conditionDescription: 'totalVolumeKg >= 1000',
    },
    {
      badgeId: '10000_volume', name: 'Titan',
      description: 'Soulevez 10 000 kg au total',
      icon: '⚡', color: '#9C27B0', category: 'workout',
      conditionDescription: 'totalVolumeKg >= 10000',
    },

    // ── Course (7) ────────────────────────────────────────────────
    {
      badgeId: 'first_run', name: 'Première foulée',
      description: 'Complétez votre première course',
      icon: '🏃', color: '#4CAF50', category: 'running',
      conditionDescription: 'totalRunningSessions >= 1',
    },
    {
      badgeId: '5km_run', name: '5 km',
      description: 'Courez 5 km en une seule course',
      icon: '🎽', color: '#009688', category: 'running',
      conditionDescription: 'maxSessionDistanceKm >= 5',
    },
    {
      badgeId: '10km_run', name: '10 km',
      description: 'Courez 10 km en une seule course',
      icon: '🥈', color: '#00BCD4', category: 'running',
      conditionDescription: 'maxSessionDistanceKm >= 10',
    },
    {
      badgeId: 'half_marathon', name: 'Semi-marathon',
      description: 'Courez 21,1 km en une seule course',
      icon: '🥇', color: '#607D8B', category: 'running',
      conditionDescription: 'maxSessionDistanceKm >= 21.1',
    },
    {
      badgeId: 'marathon', name: 'Marathonien',
      description: 'Courez 42,2 km en une seule course',
      icon: '🏅', color: '#FFC107', category: 'running',
      conditionDescription: 'maxSessionDistanceKm >= 42.2',
    },
    {
      badgeId: '50km_total', name: 'Globe-trotter',
      description: '50 km parcourus au total en course',
      icon: '🌍', color: '#03A9F4', category: 'running',
      conditionDescription: 'totalRunningKm >= 50',
    },
    {
      badgeId: '100km_total', name: 'Ultra runner',
      description: '100 km parcourus au total en course',
      icon: '🚀', color: '#512DA8', category: 'running',
      conditionDescription: 'totalRunningKm >= 100',
    },

    // ── Pas (4) ───────────────────────────────────────────────────
    {
      badgeId: '10k_steps_day', name: 'Marcheur',
      description: '10 000 pas en un jour',
      icon: '👟', color: '#2196F3', category: 'steps',
      conditionDescription: 'bestDaySteps >= 10000',
    },
    {
      badgeId: '20k_steps_day', name: 'Randonneur',
      description: '20 000 pas en un jour',
      icon: '🥾', color: '#795548', category: 'steps',
      conditionDescription: 'bestDaySteps >= 20000',
    },
    {
      badgeId: '100k_steps_total', name: '100k pas',
      description: '100 000 pas au total',
      icon: '🦶', color: '#4CAF50', category: 'steps',
      conditionDescription: 'totalSteps >= 100000',
    },
    {
      badgeId: '1m_steps_total', name: 'Millionnaire',
      description: '1 000 000 de pas au total',
      icon: '💎', color: '#00B0FF', category: 'steps',
      conditionDescription: 'totalSteps >= 1000000',
    },

    // ── Streak (5) ────────────────────────────────────────────────
    {
      badgeId: '3_day_streak', name: 'Trio gagnant',
      description: '3 jours d\'entraînement consécutifs',
      icon: '🔥', color: '#009688', category: 'streak',
      conditionDescription: 'bestStreak >= 3',
    },
    {
      badgeId: '7_day_streak', name: 'Semaine parfaite',
      description: '7 jours d\'entraînement consécutifs',
      icon: '⭐', color: '#FFEB3B', category: 'streak',
      conditionDescription: 'bestStreak >= 7',
    },
    {
      badgeId: '14_day_streak', name: 'Deux semaines',
      description: '14 jours d\'entraînement consécutifs',
      icon: '🌟', color: '#FFC107', category: 'streak',
      conditionDescription: 'bestStreak >= 14',
    },
    {
      badgeId: '30_day_streak', name: 'Mois parfait',
      description: '30 jours d\'entraînement consécutifs',
      icon: '🌠', color: '#FF8F00', category: 'streak',
      conditionDescription: 'bestStreak >= 30',
    },
    {
      badgeId: '100_day_streak', name: 'Indestructible',
      description: '100 jours d\'entraînement consécutifs',
      icon: '💥', color: '#F44336', category: 'streak',
      conditionDescription: 'bestStreak >= 100',
    },

    // ── Spéciaux (3) ─────────────────────────────────────────────
    {
      badgeId: 'early_bird', name: 'Lève-tôt',
      description: 'Entraînez-vous avant 7h',
      icon: '🌅', color: '#FF9800', category: 'special',
      conditionDescription: 'workoutStartHour < 7',
    },
    {
      badgeId: 'night_owl', name: 'Noctambule',
      description: 'Entraînez-vous après 22h',
      icon: '🦉', color: '#3F51B5', category: 'special',
      conditionDescription: 'workoutStartHour >= 22',
    },
    {
      badgeId: 'variety', name: 'Touche-à-tout',
      description: 'Utilisez 10 exercices différents',
      icon: '🎯', color: '#E91E63', category: 'special',
      conditionDescription: 'uniqueExercises >= 10',
    },
  ];

  for (const b of badges) {
    await prisma.badgeDefinition.upsert({
      where: { badgeId: b.badgeId },
      update: { name: b.name, description: b.description, icon: b.icon, color: b.color, category: b.category, conditionDescription: b.conditionDescription },
      create: b,
    });
  }

  console.log(`Seed completed: app_versions + ${badges.length} badge_definitions inserted.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
