// Pin to 1st Gen to avoid accidental 2nd Gen migration during upgrade
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

try { admin.initializeApp(); } catch (_) {}
const db = admin.firestore();

// Helper: sanitize display name server-side
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Anon';
  let v = name.trim();
  // Allow unicode letters/numbers/space/_/-; fallback ASCII if ICU not present
  try { v = v.replace(/[^\p{L}\p{N} _-]/gu, ''); } catch (_) { v = v.replace(/[^A-Za-z0-9 _-]/g, ''); }
  if (v.length < 3) v = v.padEnd(3, '_');
  if (v.length > 24) v = v.slice(0, 24);
  return v;
}

exports.setDisplayName = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const raw = (data && data.displayName) || '';
  const displayName = sanitizeName(String(raw));
  const ref = db.collection('users').doc(uid);
  await ref.set({ displayName, lastSeenAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, displayName };
});

exports.submitPrestige = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  const uid = context.auth.uid;
  const ref = db.collection('users').doc(uid);
  const now = admin.firestore.Timestamp.now();
  const minGapSeconds = 10; // basic throttle to mitigate spamming

  const MIN_RUN_BOXES = 200;

  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.exists ? snap.data() : {};
  const currentLevel = Number(doc.prestigeLevel || 0);
    const lastPrestigeAt = doc.lastPrestigeAt instanceof admin.firestore.Timestamp ? doc.lastPrestigeAt : null;
  const mythicsFound = Number(doc.mythicsFound || 0);
  const aethericsFound = Number(doc.aethericsFound || 0);
    const totalBoxesOpened = Number(doc.totalBoxesOpened || 0);
    const lastPrestigeBoxesOpened = Number(doc.lastPrestigeBoxesOpened || 0);

    if (lastPrestigeAt) {
      const diff = now.seconds - lastPrestigeAt.seconds;
      if (diff < minGapSeconds) {
        throw new functions.https.HttpsError('resource-exhausted', 'Too many prestige requests');
      }
    }

    // Basic eligibility checks based on server-known aggregates
    const runBoxes = Math.max(0, totalBoxesOpened - lastPrestigeBoxesOpened);
    // Dynamic rarity requirement by prestige tier
    // <10: 5 Mythics; <20: 1 Aetheric; <30: 2 Aetheric; >30: 3 Aetheric
    if (currentLevel < 10) {
      if (mythicsFound < 5) {
        throw new functions.https.HttpsError('failed-precondition', 'Not enough mythics for prestige');
      }
    } else if (currentLevel < 20) {
      if (aethericsFound < 1) {
        throw new functions.https.HttpsError('failed-precondition', 'Not enough aetherics for prestige');
      }
    } else if (currentLevel < 30) {
      if (aethericsFound < 2) {
        throw new functions.https.HttpsError('failed-precondition', 'Not enough aetherics for prestige');
      }
    } else { // > 30
      if (aethericsFound < 3) {
        throw new functions.https.HttpsError('failed-precondition', 'Not enough aetherics for prestige');
      }
    }
    if (runBoxes < MIN_RUN_BOXES) {
      throw new functions.https.HttpsError('failed-precondition', 'Not enough boxes opened this run');
    }

    const nextLevel = currentLevel + 1;
    tx.set(ref, {
      prestigeLevel: nextLevel,
      lastPrestigeAt: now,
      lastSeenAt: now,
      lastPrestigeBoxesOpened: totalBoxesOpened,
    }, { merge: true });
    return { prestigeLevel: nextLevel };
  });

  return res;
});
