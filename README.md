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
    // Public readable leaderboard; users can only write their own profile
    match /users/{uid} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid;

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
- The app writes the following fields on `users/{uid}`: `displayName`, `prestigeLevel`, `totalXP`, `mythicsFound`, `totalBoxesOpened`, and timestamps.
- Friends list is stored under `users/{uid}/friends/{friendUid}` with a `sinceAt` timestamp.

## 5) How it works in the app

- On first load, the app signs in anonymously and ensures your `users/{uid}` doc exists.
- When you prestige, your `prestigeLevel` is updated server-side.
- Leaderboard modal (🏅) shows two tabs:
  - Global: Top players by prestigeLevel
  - Friends: Only players you added by UID
- In the Friends tab, paste a friend's UID and click "Hinzufügen". You can also remove friends there.

## 6) Troubleshooting

- permission-denied: Check you published the rules, and Anonymous auth is enabled.
- operation-not-allowed: Anonymous sign-in not enabled.
- unavailable/not-found: Firestore database not created.

## 7) Anti-cheat

This app is client-only; values can be spoofed. For stronger validation, consider Cloud Functions to validate score updates.
