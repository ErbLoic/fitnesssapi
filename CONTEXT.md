# FitnessPro API — Contexte complet du projet

> Document de référence pour reprendre le projet avec n'importe quelle IA.
> Mis à jour : 2026-04-01

---

## 1. Vue d'ensemble

**Nom :** FitnessPro API  
**Type :** Backend REST API pour application mobile fitness Android/iOS  
**URL de prod :** `https://fitnesssapi.onrender.com`  
**Hébergement :** Render.com (Free tier) — keep-alive self-ping toutes les 14 min  
**Base de données :** PostgreSQL via Supabase (région eu-west-1)  
**Deep link app :** `fitnessppro://auth`

---

## 2. Stack technique

| Composant | Technologie |
|-----------|-------------|
| Runtime | Node.js |
| Framework | Express.js |
| ORM | Prisma v5 |
| Base de données | PostgreSQL (Supabase) |
| Auth API | JWT (access 15min + refresh 30j) |
| Auth OAuth | Passport.js (Google, GitHub, Facebook) |
| Validation | Zod |
| Chiffrement MDP | bcrypt (12 rounds) |
| Vues admin | EJS (server-side rendered) |
| CSS admin | Bootstrap 5 (CDN) |
| Versionning semver | semver npm |

### Dépendances (`package.json`)
```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "ejs": "^3.1.10",
    "express": "^4.21.1",
    "express-session": "^1.18.1",
    "jsonwebtoken": "^9.0.2",
    "passport": "^0.7.0",
    "passport-facebook": "^3.0.0",
    "passport-github2": "^0.1.12",
    "passport-google-oauth20": "^2.0.0",
    "passport-local": "^1.0.0",
    "semver": "^7.6.3",
    "zod": "^3.23.8"
  }
}
```

---

## 3. Variables d'environnement (`.env`)

```env
DATABASE_URL="postgresql://postgres.qufitubopokkluynhcoo:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_DATABASE_URL="postgresql://postgres.qufitubopokkluynhcoo:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
JWT_SECRET=<secret>
REFRESH_SECRET=<secret>
SESSION_SECRET=<secret>
ADMIN_USERNAME=<admin_login>
ADMIN_PASSWORD=<admin_password>
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
GOOGLE_CALLBACK_URL=https://fitnesssapi.onrender.com/auth/google/callback
GITHUB_CLIENT_ID=<id>
GITHUB_CLIENT_SECRET=<secret>
GITHUB_CALLBACK_URL=https://fitnesssapi.onrender.com/auth/github/callback
FACEBOOK_APP_ID=<id>
FACEBOOK_APP_SECRET=<secret>
FACEBOOK_CALLBACK_URL=https://fitnesssapi.onrender.com/auth/facebook/callback
FRONTEND_DEEPLINK=fitnessppro://auth
NODE_ENV=production
PORT=3000
```

> **Important Supabase :**
> - Runtime → Transaction Pooler port **6543** avec `?pgbouncer=true&connection_limit=1`
> - Migrations (`db push`) → Session Pooler port **5432** (même hôte pooler)
> - Commande migration : `npx prisma db push --accept-data-loss` (terminal non interactif)

---

## 4. Structure du projet

```
fitnesssapi/
├── src/
│   ├── index.js              # Point d'entrée, keep-alive self-ping en prod
│   ├── app.js                # Express app, middlewares, montage des routes
│   ├── routes/
│   │   ├── auth.js           # POST register/login/refresh/logout + OAuth
│   │   ├── users.js          # GET/PATCH me, PATCH goals, DELETE, GET search
│   │   ├── workouts.js       # CRUD séances musculation + stats
│   │   ├── running.js        # CRUD courses GPS + stats
│   │   ├── steps.js          # Pas quotidiens (today, weekly, list, upsert)
│   │   ├── weight.js         # Suivi poids (list, create, upsert, delete)
│   │   ├── badges.js         # Badges (list, unlock)
│   │   ├── settings.js       # Paramètres notifs (GET, PATCH)
│   │   ├── friends.js        # Système d'amis complet
│   │   ├── messages.js       # Messagerie / conversations DM
│   │   ├── appConfig.js      # Config app + feature flags
│   │   ├── legal.js          # Pages EJS : home, privacy, terms, data-deletion
│   │   ├── ping.js           # GET /ping — health check
│   │   └── admin/
│   │       ├── index.js      # Montage des sous-routes admin
│   │       ├── authRoutes.js # Login/logout session admin
│   │       ├── usersRoutes.js # Dashboard + gestion users + modération
│   │       ├── statsRoutes.js # Statistiques globales enrichies
│   │       ├── badgesRoutes.js# Gestion badges (définitions + attribution)
│   │       ├── versionsRoutes.js # Gestion versions app + feature flags
│   │       └── logsRoutes.js # Audit logs
│   ├── middleware/
│   │   ├── requireAuth.js    # Vérifie JWT Bearer token
│   │   └── requireAdmin.js   # Vérifie session admin
│   ├── lib/
│   │   └── tokens.js         # issueAccessToken(), issueRefreshToken()
│   ├── config/
│   │   └── passport.js       # Stratégies : local, google, github, facebook
│   └── views/
│       ├── home.ejs          # Landing page marketing (téléphone animé, APK DL)
│       ├── privacy.ejs       # Politique de confidentialité
│       ├── terms.ejs         # CGU
│       ├── data-deletion.ejs # Instructions suppression données (requis Meta)
│       ├── partials/
│       │   └── legal-head.ejs # CSS partagé thème orange #FF6B00
│       └── admin/
│           ├── layout.ejs     # Template Bootstrap sidebar
│           ├── login.ejs
│           ├── dashboard.ejs  # 7 cards + derniers inscrits + logs + top users
│           ├── users.ejs      # Liste paginée + recherche
│           ├── user-detail.ejs# Profil + séances/courses supprimables
│           ├── stats.ejs      # Stats + graphique 7j + répartition + top exos
│           ├── badges.ejs     # Catalogue + attribution manuelle
│           ├── versions.ejs   # Gestion versions + feature flags
│           ├── logs.ejs       # Audit logs paginés
│           └── error.ejs
├── public/
│   ├── fitnesspro.apk        # APK Android (téléchargement direct)
│   └── image/                # Screenshots app (pA.png, badge.png, course.png…)
├── prisma/
│   └── schema.prisma         # 28 modèles Prisma
└── API_MOBILE.md             # Documentation complète de toutes les routes API
```

---

## 5. Schéma de base de données (Prisma — noms réels des champs)

> ⚠️ Les noms de champs Prisma ne correspondent PAS toujours aux conventions habituelles.
> Toujours se référer à cette section pour éviter des erreurs.

### User
```
id, email, passwordHash, name, age, heightCm, weightKg, gender,
fitnessLevel (default:"beginner"), profileImageUrl,
dailyStepsGoal (default:10000), dailyCaloriesGoal (default:500),
weeklyWorkoutsGoal (default:4), totalWorkouts (default:0),
currentStreak (default:0), bestStreak (default:0),
onboardingComplete (default:false), isBanned (default:false),
createdAt, updatedAt
```
> Table DB : `users`

### Workout ⚠️ champs spécifiques
```
id, userId, name,
workoutType   ← (PAS "type")
startTime     ← (PAS "startedAt")
endTime       ← nullable
durationMinutes ← (PAS "durationMin")
caloriesBurned  ← (PAS "calories")
notes, createdAt
```
> Table DB : `workouts`

### ExerciseLog
```
id, workoutId, exerciseId, exerciseName, exerciseType,
notes, sortOrder, timestamp
```
> Table DB : `exercise_logs`

### SetLog
```
id, exerciseLogId, setNumber, reps, weightKg,
isCompleted, restTimeSec, setType (default:"normal")
```
> Table DB : `set_logs`

### CardioLog
```
id, exerciseLogId, durationMinutes, distanceKm, avgSpeedKmh,
maxSpeedKmh, caloriesBurned, avgHeartRate, maxHeartRate,
resistanceLevel, incline, program
```
> Table DB : `cardio_logs`

### RunningSession ⚠️ champs spécifiques
```
id, userId,
startTime     ← (PAS "startedAt")
endTime       ← nullable
durationSeconds ← (PAS "durationSec")
distanceKm, avgSpeedKmh, maxSpeedKmh, caloriesBurned,
elevationGainM, elevationLossM, avgHeartRate, maxHeartRate,
weather, temperatureC, notes, isCompleted,
splitTimes (Float[]), createdAt
```
> Table DB : `running_sessions`

### GpsPoint
```
id, sessionId, latitude, longitude, altitudeM,
speedMs, accuracyM, recordedAt, sortOrder
```
> Table DB : `gps_points`

### DailySteps
```
id, userId, date (Date), steps, distanceKm,
caloriesBurned, activeMinutes, goal, createdAt, updatedAt
@@unique([userId, date])
```
> Table DB : `daily_steps`

### HourlySteps
```
id, dailyStepsId, hour (0-23), steps
@@unique([dailyStepsId, hour])
```
> Table DB : `hourly_steps`

### WeightEntry
```
id, userId, weightKg, date (Date), note, createdAt
@@unique([userId, date])
```
> Table DB : `weight_entries`

### BadgeDefinition
```
id, badgeId (unique), name, description, icon, color,
category, conditionDescription, isActive, createdAt, updatedAt
```
> Table DB : `badge_definitions`

### UserBadge
```
id, userId, badgeId, unlockedAt
@@unique([userId, badgeId])
```
> Table DB : `user_badges`

### UserSettings
```
userId (PK), notifWorkoutReminders, notifReminderHour,
notifReminderMinute, notifStepGoalAlerts, notifWeeklyProgress,
notifMotivationalQuotes, themeDark, updatedAt
```
> Table DB : `user_settings`

### AppVersion
```
id, platform, latestVersion, minRequiredVersion, storeUrl,
releaseNotes, forceUpdate, maintenanceMode, maintenanceMessage,
socialEnabled, nutritionEnabled, premiumEnabled,
aiCoachEnabled, leaderboardEnabled, createdAt, updatedAt
```
> Table DB : `app_versions`

### Friendship
```
id, requesterId, receiverId,
status  (default:"pending" → "accepted")
createdAt
@@unique([requesterId, receiverId])
```
> Table DB : `friendships`

### Conversation
```
id, createdAt, updatedAt
```
> Table DB : `conversations`

### ConversationParticipant
```
conversationId, userId, joinedAt, lastReadAt (nullable)
@@id([conversationId, userId])
```
> Table DB : `conversation_participants`

### Message
```
id, conversationId, senderId, body (nullable),
workoutId (nullable), runningId (nullable), createdAt
```
> Table DB : `messages`

### AuditLog
```
id, adminId (nullable), action, targetType, targetId, payload (Json), createdAt
```
> Table DB : `audit_logs`

### PushToken
```
id, userId, token, platform, createdAt, updatedAt
@@unique([userId, token])
```
> Table DB : `push_tokens`

### Autres modèles disponibles (routes non implémentées)
- `BodyMeasurement` — mesures corporelles (chest, waist, hips, bicep, thigh…)
- `FoodLog` — journal alimentaire (mealType, foodName, calories, macros)
- `NutritionGoal` — objectifs nutritionnels (calories, protéines, glucides, lipides)
- `HydrationLog` — suivi hydratation (amountMl)
- `HydrationGoal` — objectif eau quotidien
- `SleepLog` — suivi sommeil (bedTime, wakeTime, durationMin, qualityScore)
- `SavedRoute` — routes GPS sauvegardées
- `Challenge` / `ChallengeParticipant` — défis entre utilisateurs
- `Subscription` — abonnements premium
- `AiRecommendation` — recommandations IA
- `PersonalRecord` — records personnels

---

## 6. Authentification

### API Mobile (JWT)
- **Access token** : JWT, durée 15 min, signé avec `JWT_SECRET`
- **Refresh token** : JWT longue durée (30j), stocké en BDD (`refresh_tokens`), signé avec `REFRESH_SECRET`
- **Header** : `Authorization: Bearer <accessToken>`
- `req.userId` est injecté par le middleware `requireAuth`

### OAuth (Passport.js)
- **Stratégies** : Google, GitHub, Facebook
- **Callback** : deep link `fitnessppro://auth?token=ACCESS&refresh=REFRESH&userId=ID&isNew=true|false`
- Upsert automatique : si l'email existe déjà → lie le provider au compte existant

### Panel admin (session Express)
- Session en mémoire (express-session), durée 8h
- Credentials dans `.env` : `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- Middleware : `requireAdmin` vérifie `req.session.admin === true`

---

## 7. Toutes les routes API (résumé)

### Auth (`/auth`)
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/auth/register` | Non | Inscription (email, password, name + champs optionnels profil) |
| POST | `/auth/login` | Non | Connexion email/password |
| POST | `/auth/refresh` | Non | Renouvelle l'access token |
| POST | `/auth/logout` | JWT | Invalide le refresh token |
| GET | `/auth/google` | Non | Redirect OAuth Google |
| GET | `/auth/github` | Non | Redirect OAuth GitHub |
| GET | `/auth/facebook` | Non | Redirect OAuth Facebook |

### Utilisateur (`/users`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/users/me` | Profil complet |
| PATCH | `/users/me` | Mise à jour profil |
| PATCH | `/users/me/goals` | Mise à jour objectifs |
| DELETE | `/users/me` | Supprime le compte |
| GET | `/users/search?q=` | Recherche par nom (min 2 chars) |

### Séances muscu (`/workouts`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/workouts` | Liste paginée (?page, ?limit, ?from, ?to) |
| POST | `/workouts` | Créer séance (avec exercices/sets/cardio) |
| GET | `/workouts/stats/summary` | Stats globales |
| GET | `/workouts/:id` | Détail complet |
| PATCH | `/workouts/:id` | Modifier |
| DELETE | `/workouts/:id` | Supprimer |

#### Body POST /workouts (champs réels)
```json
{
  "name": "Full Body",
  "workoutType": "strength",
  "startTime": "2025-03-20T09:00:00.000Z",
  "endTime": "2025-03-20T10:00:00.000Z",
  "durationMinutes": 60,
  "caloriesBurned": 420,
  "notes": "",
  "exercises": [
    {
      "exerciseId": "bench_press",
      "exerciseName": "Développé couché",
      "exerciseType": "strength",
      "sortOrder": 0,
      "sets": [
        { "setNumber": 1, "reps": 10, "weightKg": 80, "setType": "normal", "restTimeSec": 90 }
      ]
    }
  ]
}
```

### Courses GPS (`/running`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/running` | Liste paginée |
| POST | `/running` | Créer course (avec GPS points) |
| GET | `/running/stats/summary` | Stats globales |
| GET | `/running/:id` | Détail avec gpsPoints |
| DELETE | `/running/:id` | Supprimer |

#### Body POST /running (champs réels)
```json
{
  "startTime": "2025-03-19T07:00:00.000Z",
  "durationSeconds": 2700,
  "distanceKm": 8.5,
  "caloriesBurned": 520,
  "avgSpeedKmh": 11.3,
  "maxSpeedKmh": 14.2,
  "elevationGainM": 45,
  "splitTimes": [5.1, 5.3, 5.5],
  "gpsPoints": [
    { "latitude": 48.8566, "longitude": 2.3522, "altitudeM": 35,
      "speedMs": 3.0, "accuracyM": 5, "recordedAt": "2025-03-19T07:00:00.000Z", "sortOrder": 0 }
  ]
}
```

### Pas (`/steps`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/steps/today` | Pas du jour |
| GET | `/steps/stats/weekly` | Stats 7 derniers jours |
| GET | `/steps` | Historique paginé |
| PUT | `/steps/:date` | Upsert (date format YYYY-MM-DD) |

### Poids (`/weight`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/weight` | Historique paginé |
| POST | `/weight` | Créer entrée |
| PUT | `/weight/:date` | Upsert par date |
| DELETE | `/weight/:id` | Supprimer |

### Badges (`/badges`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/badges` | Liste badges débloqués |
| POST | `/badges/:badgeId` | Débloquer un badge |

### Paramètres (`/settings`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/settings` | Récupère paramètres |
| PATCH | `/settings` | Met à jour paramètres |

### Amis (`/friends`)
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/friends/request` | Envoyer demande d'ami `{ userId }` |
| GET | `/friends` | Liste amis acceptés |
| GET | `/friends/requests` | Demandes reçues en attente |
| GET | `/friends/sent` | Demandes envoyées en attente |
| POST | `/friends/:id/accept` | Accepter (seul le receiverId peut) |
| POST | `/friends/:id/decline` | Refuser (supprime la relation) |
| DELETE | `/friends/:id` | Supprimer ami (les 2 parties peuvent) |

### Messagerie (`/conversations`)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/conversations` | Liste conversations + unreadCount |
| POST | `/conversations` | Créer/récupérer DM `{ userId }` |
| GET | `/conversations/:id/messages` | Messages (cursor `?cursor=`) |
| POST | `/conversations/:id/messages` | Envoyer `{ body?, workoutId?, runningId? }` |
| POST | `/conversations/:id/read` | Marquer comme lu |

### Config app
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/app/config?platform=android&version=1.0.0` | Non | Version min, feature flags, maintenance |

### Santé
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/ping` | Non | Health check `{ status: "ok" }` |

---

## 8. Panel admin (`/admin`)

**Accès :** `https://fitnesssapi.onrender.com/admin`  
**Auth :** session cookie (login/password depuis `.env`)

### Pages
| URL | Description |
|-----|-------------|
| `/admin` | Dashboard : 7 cards + derniers inscrits + logs récents + top users |
| `/admin/users` | Liste utilisateurs + recherche + pagination (20/page) |
| `/admin/users/:id` | Détail : profil + 5 séances + 5 courses + stats + badges + ban/delete |
| `/admin/stats` | Stats globales + graphique inscriptions 7j + répartition séances + top exercices |
| `/admin/badges` | Catalogue badges + attribution manuelle |
| `/admin/versions` | Gestion versions Android/iOS + feature flags |
| `/admin/logs` | Audit logs paginés (50/page) |

### Actions de modération disponibles
- Bannir / débannir un utilisateur → loggé `BAN_USER` / `UNBAN_USER`
- Supprimer un compte (cascade toutes les données) → loggé `DELETE_USER`
- Supprimer une séance → loggé `DELETE_WORKOUT`
- Supprimer une course → loggé `DELETE_RUN`
- Attribuer / révoquer un badge → loggé `GRANT_BADGE`
- Modifier les versions app / feature flags → loggé `UPDATE_APP_VERSION`

### Conformité RGPD/CNIL
- Pas de contenu de messages affiché
- Pas de données de santé (poids, GPS, FC) visibles
- Uniquement métadonnées (counts, dates, nom/email)

---

## 9. Pages web publiques

| URL | Description |
|-----|-------------|
| `/` | Landing page marketing (EJS + CSS pur, animations, phone frames, APK download) |
| `/privacy` | Politique de confidentialité |
| `/terms` | Conditions générales d'utilisation |
| `/data-deletion` | Instructions suppression données (requis par Meta/Facebook) |

**APK :** `https://fitnesssapi.onrender.com/fitnesspro.apk` (servi via `express.static`)  
**Images :** `https://fitnesssapi.onrender.com/image/*.png`

---

## 10. Conventions et points d'attention

### Erreurs API (format standard)
```json
{ "error": "ERROR_CODE", "message": "Description lisible" }
```

### Codes d'erreur
- `400 VALIDATION_ERROR` — Données invalides
- `401 UNAUTHORIZED` — Token manquant/expiré
- `403 FORBIDDEN` — Compte banni ou accès refusé
- `404 NOT_FOUND` — Ressource introuvable
- `409 CONFLICT` — Email déjà utilisé, badge déjà débloqué, etc.

### Pièges connus (champs Prisma ≠ noms API)
| Modèle | Nom Prisma réel | Nom API retourné | ⚠️ Piège |
|--------|----------------|-----------------|---------|
| Workout | `workoutType` | `workoutType` | PAS `type` |
| Workout | `startTime` | `startTime` | PAS `startedAt` |
| Workout | `durationMinutes` | `durationMinutes` | PAS `durationMin` |
| Workout | `caloriesBurned` | `caloriesBurned` | PAS `calories` |
| RunningSession | `startTime` | `startTime` | PAS `startedAt` |
| RunningSession | `durationSeconds` | `durationSeconds` | PAS `durationSec` |
| Friendship | `receiverId` | `receiverId` | PAS `addresseeId` |

### Feature flags (AppVersion)
Contrôlent ce qui est activé dans l'app :
- `socialEnabled` — système d'amis et messagerie
- `nutritionEnabled` — journal alimentaire
- `premiumEnabled` — abonnement premium
- `aiCoachEnabled` — coach IA
- `leaderboardEnabled` — classements

### Keep-alive (Render Free)
```js
// src/index.js — ping toutes les 14 minutes en production
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    require('https').get('https://fitnesssapi.onrender.com/ping', () => {});
  }, 14 * 60 * 1000);
}
```

---

## 11. Routes non encore implémentées (modèles existants en BDD)

Ces modèles existent dans le schéma Prisma mais n'ont pas de routes API :
- **Nutrition** : `FoodLog`, `NutritionGoal`
- **Hydratation** : `HydrationLog`, `HydrationGoal`
- **Sommeil** : `SleepLog`
- **Mesures corporelles** : `BodyMeasurement`
- **Défis** : `Challenge`, `ChallengeParticipant`
- **Routes GPS sauvegardées** : `SavedRoute`
- **Abonnements** : `Subscription`
- **Push notifications** : `PushToken` (enregistrement token OK, envoi non implémenté)
- **Recommandations IA** : `AiRecommendation`
- **Records personnels** : `PersonalRecord`

---

## 12. Fichiers de documentation disponibles

| Fichier | Contenu |
|---------|---------|
| `API_MOBILE.md` | Doc complète de toutes les routes avec exemples JSON |
| `UPDATES.md` | Résumé des dernières modifications pour le dev Flutter |
| `CONTEXT.md` | Ce fichier — contexte complet du projet |
