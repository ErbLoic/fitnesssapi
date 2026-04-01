/**
 * Transformers.js — Conversion bidirectionnelle entre format App Flutter et format API
 * 
 * L'app Flutter envoie des données avec des noms de champs DIFFÉRENTS de ceux attendus en retour.
 * Ces fonctions gèrent les conversions pour éviter la perte de données.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORKOUTS — Transformation bidirectionnelle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Transforme le JSON reçu de l'app Flutter → Format Prisma
 * App envoie: type, startedAt, endedAt, durationMin, calories, exercises[{muscleGroup, sets[{restSec, type}]}]
 * API stocke: workoutType, startTime, endTime, durationMinutes, caloriesBurned, exercises[{exerciseType, sets[{restTimeSec, setType}]}]
 */
function transformWorkoutFromApp(appData) {
  return {
    name: appData.name,
    workoutType: appData.type || 'strength',  // ← clé différente
    startTime: appData.startedAt ? new Date(appData.startedAt) : new Date(),
    endTime: appData.endedAt ? new Date(appData.endedAt) : undefined,
    durationMinutes: appData.durationMin ?? appData.durationMinutes ?? 0,  // ← accepte les deux
    caloriesBurned: appData.calories ?? appData.caloriesBurned ?? 0,  // ← accepte les deux
    notes: appData.notes,
    exercises: appData.exercises?.map(ex => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      exerciseType: ex.muscleGroup || ex.exerciseType || 'strength',  // ← clé différente
      notes: ex.notes,
      sortOrder: ex.sortOrder ?? 0,
      sets: ex.sets?.map(set => ({
        setNumber: set.setNumber,
        reps: set.reps ?? 0,
        weightKg: set.weightKg ?? 0,
        isCompleted: set.isCompleted ?? true,
        restTimeSec: set.restSec ?? set.restTimeSec ?? 0,  // ← clé différente
        setType: set.type ?? set.setType ?? 'normal',  // ← clé différente
      })),
      cardio: ex.cardio ? {
        durationMinutes: ex.cardio.durationMin ?? ex.cardio.durationMinutes ?? 0,
        distanceKm: ex.cardio.distanceKm ?? 0,
        avgSpeedKmh: ex.cardio.avgSpeedKmh ?? 0,
        maxSpeedKmh: ex.cardio.maxSpeedKmh ?? 0,
        caloriesBurned: ex.cardio.calories ?? ex.cardio.caloriesBurned ?? 0,
        avgHeartRate: ex.cardio.avgHeartRate,
        maxHeartRate: ex.cardio.maxHeartRate,
        resistanceLevel: ex.cardio.resistanceLevel,
        incline: ex.cardio.incline,
        program: ex.cardio.program,
      } : undefined,
    })),
  };
}

/**
 * Formate la réponse API pour l'app Flutter
 * Prisma stocke: workoutType, startTime, endTime, durationMinutes, caloriesBurned, exercises[{exerciseType, sets[{restTimeSec, setType}]}]
 * App attend: workoutType, startTime, durationMinutes, caloriesBurned, exercises[{exerciseType, sets[{restTimeSec, setType}]}]
 */
function formatWorkoutForApp(prismaWorkout) {
  return {
    id: prismaWorkout.id,
    name: prismaWorkout.name,
    workoutType: prismaWorkout.workoutType,  // ← keep same
    startTime: prismaWorkout.startTime,
    endTime: prismaWorkout.endTime,
    durationMinutes: prismaWorkout.durationMinutes,  // ← keep same
    caloriesBurned: prismaWorkout.caloriesBurned,  // ← keep same
    notes: prismaWorkout.notes,
    exercises: prismaWorkout.exerciseLogs?.map(ex => ({
      id: ex.id,
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      exerciseType: ex.exerciseType,  // ← keep same
      timestamp: ex.timestamp,
      sets: ex.setLogs?.map(set => ({
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        isCompleted: set.isCompleted,
        restTimeSec: set.restTimeSec,  // ← keep same
        setType: set.setType,  // ← keep same
      })),
      cardioLog: ex.cardioLogs?.[0] ? {
        durationMinutes: ex.cardioLogs[0].durationMinutes,
        distanceKm: ex.cardioLogs[0].distanceKm,
        avgSpeedKmh: ex.cardioLogs[0].avgSpeedKmh,
        maxSpeedKmh: ex.cardioLogs[0].maxSpeedKmh,
        caloriesBurned: ex.cardioLogs[0].caloriesBurned,
        avgHeartRate: ex.cardioLogs[0].avgHeartRate,
        maxHeartRate: ex.cardioLogs[0].maxHeartRate,
        resistanceLevel: ex.cardioLogs[0].resistanceLevel,
        incline: ex.cardioLogs[0].incline,
        program: ex.cardioLogs[0].program,
      } : null,
      notes: ex.notes,
    })) || [],
  };
}

/**
 * Calcule un hash pour détecter les workouts dupliqués
 * Clés: userId + workoutType + startTime + durationMinutes
 */
function hashWorkout(userId, workoutType, startTime, durationMinutes) {
  return `${userId}#${workoutType}#${startTime.getTime()}#${durationMinutes}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RUNNING — Transformation bidirectionnelle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Transforme le JSON reçu de l'app Flutter → Format Prisma
 * App envoie: startedAt, endedAt, durationSec, calories, avgHeartRateBpm, splits[{km, timeMin}], gpsPoints[{lat, lng, speedKmh}]
 * API stocke: startTime, endTime, durationSeconds, caloriesBurned, avgHeartRate, splitTimes[seconds], gpsPoints[{latitude, longitude, speedMs}]
 */
function transformRunningFromApp(appData) {
  // Convertir splits [{km, timeMin}] → splitTimes [seconds]
  const splitTimes = appData.splits?.map(s => s.timeMin * 60) || [];

  return {
    startTime: appData.startedAt ? new Date(appData.startedAt) : new Date(),
    endTime: appData.endedAt ? new Date(appData.endedAt) : undefined,
    durationSeconds: appData.durationSec ?? appData.durationSeconds ?? 0,  // ← clé différente
    distanceKm: appData.distanceKm ?? 0,
    avgSpeedKmh: appData.avgSpeedKmh ?? 0,
    maxSpeedKmh: appData.maxSpeedKmh ?? 0,
    caloriesBurned: appData.calories ?? appData.caloriesBurned ?? 0,  // ← clé différente
    elevationGainM: appData.elevationGainM ?? 0,
    elevationLossM: appData.elevationLossM ?? 0,
    avgHeartRate: appData.avgHeartRateBpm ?? appData.avgHeartRate,  // ← clé différente
    maxHeartRate: appData.maxHeartRate,
    weather: appData.weatherCondition ?? appData.weather,  // ← accepte les deux
    temperatureC: appData.temperatureC,
    notes: appData.notes,
    isCompleted: appData.isCompleted ?? true,
    splitTimes,  // ← converti
    gpsPoints: appData.gpsPoints?.map(p => ({
      latitude: p.lat ?? p.latitude,  // ← clé différente
      longitude: p.lng ?? p.longitude,  // ← clé différente
      altitudeM: p.altitudeM ?? 0,
      speedMs: (p.speedKmh ?? p.speedMs ?? 0) / 3.6,  // ← conversion km/h → m/s
      accuracyM: p.accuracyM,
      recordedAt: new Date(p.recordedAt),
      sortOrder: p.sortOrder ?? 0,
    })),
  };
}

/**
 * Formate la réponse API pour l'app Flutter
 * Prisma stocke: startTime, durationSeconds, caloriesBurned, avgHeartRate, splitTimes[seconds], gpsPoints[{latitude, longitude, speedMs}]
 * App attend: startTime, durationSeconds, caloriesBurned, avgHeartRate, splitTimes[seconds], gpsPoints[{latitude, longitude, speedMs}]
 */
function formatRunningForApp(prismaSession) {
  return {
    id: prismaSession.id,
    startTime: prismaSession.startTime,
    endTime: prismaSession.endTime,
    durationSeconds: prismaSession.durationSeconds,
    distanceKm: prismaSession.distanceKm,
    avgSpeedKmh: prismaSession.avgSpeedKmh,
    maxSpeedKmh: prismaSession.maxSpeedKmh,
    caloriesBurned: prismaSession.caloriesBurned,
    elevationGainM: prismaSession.elevationGainM,
    elevationLossM: prismaSession.elevationLossM,
    avgHeartRate: prismaSession.avgHeartRate,
    maxHeartRate: prismaSession.maxHeartRate,
    weather: prismaSession.weather,
    temperatureC: prismaSession.temperatureC,
    notes: prismaSession.notes,
    isCompleted: prismaSession.isCompleted,
    splitTimes: prismaSession.splitTimes,
    gpsPoints: prismaSession.gpsPoints?.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
      altitudeM: p.altitudeM,
      speedMs: p.speedMs,  // ← déjà en m/s
      accuracyM: p.accuracyM,
      recordedAt: p.recordedAt,
    })) || [],
  };
}

/**
 * Calcule un hash pour détecter les running sessions dupliquées
 * Clés: userId + startTime + durationSeconds + distanceKm
 */
function hashRunning(userId, startTime, durationSeconds, distanceKm) {
  return `${userId}#${startTime.getTime()}#${durationSeconds}#${distanceKm}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEPS — Transformation bidirectionnelle
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Transforme le JSON reçu de l'app Flutter → Format Prisma
 * App envoie: hourlySteps[int×24], calories
 * API stocke: hourlySteps objets + caloriesBurned
 */
function transformStepsFromApp(appData) {
  return {
    steps: appData.steps ?? 0,
    distanceKm: appData.distanceKm ?? 0,
    caloriesBurned: appData.calories ?? appData.caloriesBurned ?? 0,  // ← clé différente
    activeMinutes: appData.activeMinutes ?? 0,
    goal: appData.goal ?? 10000,
    hourlyData: appData.hourlySteps?.map((steps, hour) => ({ hour, steps })),
  };
}

/**
 * Formate la réponse API pour l'app Flutter
 * Prisma stocke: caloriesBurned, hourlySteps [{hour, steps}]
 * App attend: caloriesBurned, hourlyData [{hour, steps}]
 */
function formatStepsForApp(prismaDailySteps) {
  return {
    id: prismaDailySteps.id,
    date: prismaDailySteps.date,
    steps: prismaDailySteps.steps,
    distanceKm: prismaDailySteps.distanceKm,
    caloriesBurned: prismaDailySteps.caloriesBurned,
    activeMinutes: prismaDailySteps.activeMinutes,
    goal: prismaDailySteps.goal,
    hourlyData: prismaDailySteps.hourlySteps?.map(h => ({ hour: h.hour, steps: h.steps })) || [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = {
  transformWorkoutFromApp,
  formatWorkoutForApp,
  hashWorkout,
  transformRunningFromApp,
  formatRunningForApp,
  hashRunning,
  transformStepsFromApp,
  formatStepsForApp,
};
