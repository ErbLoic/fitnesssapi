# Mises à jour API — 28 mars 2026

## 1. Keep-alive (Render Free)

Le serveur se self-ping toutes les **14 minutes** en production pour éviter la mise en veille automatique de Render Free. Aucune action côté mobile.

---

## 2. Recherche d'utilisateurs

### `GET /users/search?q=<terme>`

Recherche des utilisateurs par nom. Nécessite un token JWT.

**Query params**

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `q` | string | oui | Terme de recherche (min 2 caractères) |

**Réponse 200**
```json
[
  {
    "id": "uuid",
    "name": "John Doe",
    "fitnessLevel": "intermediate",
    "profileImageUrl": "https://..."
  }
]
```

> Note : l'email n'est jamais retourné pour éviter les confusions de profils.

---

## 3. Messagerie (conversations directes)

Base URL : `/conversations`
Toutes les routes nécessitent un token JWT (`Authorization: Bearer <token>`).

---

### `GET /conversations`

Liste toutes les conversations de l'utilisateur connecté.

**Réponse 200**
```json
[
  {
    "id": "uuid",
    "updatedAt": "2026-03-28T12:00:00Z",
    "participants": [
      { "id": "uuid", "name": "Alice", "profileImageUrl": null }
    ],
    "lastMessage": {
      "id": "uuid",
      "body": "Regarde ma séance !",
      "senderId": "uuid",
      "createdAt": "2026-03-28T12:00:00Z",
      "workoutId": null,
      "runningId": null
    },
    "unreadCount": 2
  }
]
```

---

### `POST /conversations`

Crée ou récupère une conversation avec un autre utilisateur. Si une conversation existe déjà entre les deux, retourne son `id` existant.

**Body**
```json
{ "userId": "uuid-de-l-autre-utilisateur" }
```

**Réponse 201**
```json
{ "id": "uuid-de-la-conversation" }
```

---

### `GET /conversations/:id/messages`

Récupère les messages d'une conversation (pagination cursor-based, 30 messages par page, ordre chronologique).

**Query params**

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `cursor` | string | non | ID du dernier message reçu pour charger les suivants |

**Réponse 200**
```json
{
  "messages": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "senderId": "uuid",
      "body": "Salut !",
      "createdAt": "2026-03-28T12:00:00Z",
      "sender": { "id": "uuid", "name": "Alice", "profileImageUrl": null },
      "workout": null,
      "running": null
    },
    {
      "id": "uuid",
      "body": null,
      "workout": {
        "id": "uuid",
        "name": "Push Day",
        "durationMinutes": 60,
        "caloriesBurned": 450
      },
      "running": null
    }
  ],
  "nextCursor": "uuid-du-dernier-message-ou-null"
}
```

> Pour charger la page suivante, passer `?cursor=<nextCursor>`. Si `nextCursor` est `null`, il n'y a plus de messages.

---

### `POST /conversations/:id/messages`

Envoie un message. Au moins un des champs `body`, `workoutId` ou `runningId` est requis.

**Body**
```json
{
  "body": "Regarde cette séance !",
  "workoutId": "uuid-optionnel",
  "runningId": "uuid-optionnel"
}
```

**Réponse 201** — le message créé (même format que dans la liste).

---

### `POST /conversations/:id/read`

Marque la conversation comme lue (met à jour le compteur `unreadCount`).

**Body** — vide

**Réponse 200**
```json
{ "ok": true }
```

---

## 4. Authentification Facebook

### `GET /auth/facebook`

Redirige vers la page de connexion Facebook. Même flow que Google/GitHub.

### `GET /auth/facebook/callback`

Callback OAuth Facebook. En cas de succès, redirige vers le deeplink de l'app :
```
fitnessppro://auth?token=<accessToken>&refresh=<refreshToken>
```

> **Configuration requise** : renseigner `FACEBOOK_APP_ID` et `FACEBOOK_APP_SECRET` dans les variables d'environnement Render avant d'activer ce flow.

---

## Résumé des nouvelles routes

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `GET` | `/users/search?q=` | JWT | Recherche par nom |
| `GET` | `/conversations` | JWT | Liste des conversations |
| `POST` | `/conversations` | JWT | Créer/récupérer un DM |
| `GET` | `/conversations/:id/messages` | JWT | Messages paginés |
| `POST` | `/conversations/:id/messages` | JWT | Envoyer un message |
| `POST` | `/conversations/:id/read` | JWT | Marquer comme lu |
| `GET` | `/auth/facebook` | — | Login Facebook |
| `GET` | `/auth/facebook/callback` | — | Callback Facebook |
