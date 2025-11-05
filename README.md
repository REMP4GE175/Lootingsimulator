# Lootingsimulator – Firebase Leaderboard Setup

This doc summarizes the minimal steps to enable the Firebase-based leaderboards and the optional friends leaderboard.

## 1) Enable Firestore

- Open Firebase Console → your project → Build → Firestore Database
- Click Create database → choose Production mode (recommended)
- Pick a region (cannot be changed later)

## 2) Enable Anonymous Authentication

- Firebase Console → Build → Authentication → Sign-in method
- Enable "Anonymous" and save

## 3) Client Config

- Put your web app config into `firebase-config.js` (replace the placeholders):

```
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID",
};
```

## 4) Firestore Security Rules (Global leaderboard + Friends)

Use the following rules and click Publish in the Rules tab:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public readable leaderboard; users can only write safe fields on their own profile
    match /users/{uid} {
      allow read: if true;
      allow update: if request.auth != null && request.auth.uid == uid
                    // Only allow client to update these fields
                    && request.resource.data.keys().hasOnly(['displayName','totalXP','mythicsFound','totalBoxesOpened','createdAt','lastSeenAt'])
                    // Do NOT allow client to change prestigeLevel or server-maintained markers
                    && request.resource.data.prestigeLevel == resource.data.prestigeLevel
                    && request.resource.data.lastPrestigeBoxesOpened == resource.data.lastPrestigeBoxesOpened
                    // Validate types
                    && (request.resource.data.displayName is string || !('displayName' in request.resource.data))
                    && (request.resource.data.totalXP is int || !('totalXP' in request.resource.data))
                    && (request.resource.data.mythicsFound is int || !('mythicsFound' in request.resource.data))
                    && (request.resource.data.totalBoxesOpened is int || !('totalBoxesOpened' in request.resource.data));

      // Allow initial create with minimal fields
      allow create: if request.auth != null && request.auth.uid == uid;

      // Friends subcollection: user may manage their own friends list
      match /friends/{friendUid} {
        allow read: if request.auth != null && request.auth.uid == uid;
        allow write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

Notes:
- The client writes: `displayName` (prefer callable), `totalXP` (best-effort), `mythicsFound`, `totalBoxesOpened`, and timestamps.
- The server (Cloud Functions) writes: `prestigeLevel`, `lastPrestigeAt`, `lastPrestigeBoxesOpened`.
- Friends list is stored under `users/{uid}/friends/{friendUid}` with a `sinceAt` timestamp.

## 5) Cloud Functions (Fair prestige + Name updates)

We run two callable functions:

- `submitPrestige`: Validates you have at least 5 mythic items discovered and 200 boxes opened since your last prestige, and then atomically increments `prestigeLevel`. It updates `lastPrestigeAt` and `lastPrestigeBoxesOpened`.
- `setDisplayName`: Sanitizes and sets your `displayName` server-side.

Deploying functions:

1. Install Firebase CLI (if not yet): https://firebase.google.com/docs/cli
2. Login: `firebase login`
3. Set the project: `firebase use --add` and choose your Firebase project (or pass `--project <PROJECT_ID>` on deploy)
4. Deploy only functions from this repo root:
   - `firebase deploy --only functions`

Make sure your `firebase.json` includes:

```
{
  "functions": { "source": "functions" }
}
```

## 6) How it works in the app

- On first load, the app signs in anonymously and ensures your `users/{uid}` doc exists.
- When you prestige, your `prestigeLevel` is updated server-side via Cloud Function.
- Leaderboard modal (🏅) shows two tabs:
  - Global: Top players by prestigeLevel
  - Friends: Only players you added by UID
- In the Friends tab, paste a friend's UID and click "Hinzufügen". You can also remove friends there.

## 7) Troubleshooting

- permission-denied: Check you published the rules, and Anonymous auth is enabled.
- operation-not-allowed: Anonymous sign-in not enabled.
- unavailable/not-found: Firestore database not created.

## 8) Anti-cheat

This app is client-only; values can be spoofed. For stronger validation, consider Cloud Functions to validate score updates.

Recommendations:
- Use the provided Cloud Functions (already implemented) to make prestige authoritative.
- Keep rules strict (client cannot modify prestigeLevel or lastPrestigeBoxesOpened).
- Debounce client writes (already minimal).
- Sanitize names; the server enforces this via `setDisplayName`.
