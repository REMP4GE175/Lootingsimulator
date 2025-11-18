const functions = require('firebase-functions');
const admin = require('firebase-admin');
const gameConfig = require('./gameConfig');
admin.initializeApp();

const db = admin.firestore();

// Schimpfwortfilter - Blockiere unangemessene Namen
const PROFANITY_LIST = [
  'arsch', 'scheisse', 'scheiße', 'fick', 'fotze', 'hurensohn', 'wichser', 'penner',
  'bastard', 'hure', 'piss', 'kacke', 'schlampe', 'hitler', 'nazi', 'nigger', 'nigg',
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'cock', 'whore',
  'slut', 'fag', 'faggot', 'retard', 'rape', 'porn', 'sex', 'xxx', 'anal',
  'admin', 'moderator', 'system', 'official', 'staff', 'support'
];

function containsProfanity(text) {
  if (!text) return false;
  const normalized = text.toLowerCase()
    .replace(/[^a-zäöüß0-9]/g, '') // Entferne Sonderzeichen
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
  
  return PROFANITY_LIST.some(word => normalized.includes(word));
}

/**
 * Sync complete user data - NO APP CHECK
 */
exports.syncUserData = functions.https.onRequest(async (req, res) => {
  // CORS Headers zuerst setzen
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const data = req.body.data;

    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Invalid data' });
      return;
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    // Anti-cheat
    if (userDoc.exists) {
      const current = userDoc.data();
      const isReset = (data.balance === 500 && data.playerLevel === 0 && data.totalXPEarned === 0);
      
      if (!isReset) {
        if (data.totalXPEarned < (current.totalXPEarned || 0)) {
          res.status(403).json({ error: 'Total XP cannot decrease' });
          return;
        }
        if (data.totalBoxesOpened < (current.totalBoxesOpened || 0)) {
          res.status(403).json({ error: 'Boxes opened cannot decrease' });
          return;
        }
      }
    }

    // Validate stats against MAX limits
    if (data.statUpgradesLevels) {
      const stats = data.statUpgradesLevels;
      if (stats.wealth > gameConfig.MAX_STAT_LEVELS.wealth) {
        res.status(403).json({ error: `Wealth stat cannot exceed ${gameConfig.MAX_STAT_LEVELS.wealth}` });
        return;
      }
      if (stats.luck > gameConfig.MAX_STAT_LEVELS.luck) {
        res.status(403).json({ error: `Luck stat cannot exceed ${gameConfig.MAX_STAT_LEVELS.luck}` });
        return;
      }
      if (stats.tempo > gameConfig.MAX_STAT_LEVELS.tempo) {
        res.status(403).json({ error: `Tempo stat cannot exceed ${gameConfig.MAX_STAT_LEVELS.tempo}` });
        return;
      }
    }

    // Validate prestige level
    if (data.prestigeLevel > gameConfig.MAX_PRESTIGE_LEVEL) {
      res.status(403).json({ error: `Prestige level cannot exceed ${gameConfig.MAX_PRESTIGE_LEVEL}` });
      return;
    }

    // Validate skill points
    const totalSkillPoints = (data.skills?.wohlstand || 0) + (data.skills?.glueck || 0) + (data.skills?.effizienz || 0);
    if (totalSkillPoints > gameConfig.MAX_SKILL_POINTS) {
      res.status(403).json({ error: `Total skill points cannot exceed ${gameConfig.MAX_SKILL_POINTS}` });
      return;
    }

    // Plausibility check: balance shouldn't be astronomically high
    const prestigeLevel = data.prestigeLevel || 0;
    const boxesOpened = data.totalBoxesOpened || 0;
    // Theoretical max: assume best box (Box#10, ~10000 avg) * boxes * prestige multiplier (up to 11x at prestige 1000)
    const theoreticalMaxBalance = boxesOpened * 10000 * (1 + prestigeLevel * 0.01) * 2; // 2x safety margin
    if (data.balance > theoreticalMaxBalance && theoreticalMaxBalance > 0) {
      console.warn(`[ANTI-CHEAT] Suspicious balance for user ${userId}: ${data.balance} (theoretical max: ${theoreticalMaxBalance})`);
      res.status(403).json({ error: 'Balance exceeds plausible maximum' });
      return;
    }

    // Plausibility check: XP shouldn't be impossible
    // Each box gives ~100-500 XP on average, prestige level gives bonus
    const theoreticalMaxXP = boxesOpened * 500 * (1 + prestigeLevel * 0.01) * 2; // 2x safety margin
    if (data.totalXPEarned > theoreticalMaxXP && theoreticalMaxXP > 0) {
      console.warn(`[ANTI-CHEAT] Suspicious XP for user ${userId}: ${data.totalXPEarned} (theoretical max: ${theoreticalMaxXP})`);
      res.status(403).json({ error: 'XP exceeds plausible maximum' });
      return;
    }

    const userData = {
      displayName: data.displayName || 'Anonym',
      totalXP: data.totalXPEarned || 0,
      totalBoxesOpened: data.totalBoxesOpened || 0,
      mythicsFound: data.mythicsFound || 0,
      aethericsFound: data.aethericsFound || 0,
      balance: data.balance || 0,
      playerLevel: data.playerLevel || 0,
      playerXP: data.playerXP || 0,
      totalXPEarned: data.totalXPEarned || 0,
      skillPoints: data.skillPoints || 0,
      skills: data.skills || { wohlstand: 0, glueck: 0, effizienz: 0 },
      prestigeLevel: data.prestigeLevel || 0,
      runBoxesOpened: data.runBoxesOpened || 0,
      activeBoosts: data.activeBoosts || {},
      permanentUpgrades: data.permanentUpgrades || {},
      purchasedItems: data.purchasedItems || [],
      statUpgradesLevels: data.statUpgradesLevels || { wealth: 0, luck: 0, tempo: 0 },
      keysInventory: data.keysInventory || { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 },
      boxType: data.boxType || 'Box#1',
      unlockedBoxes: data.unlockedBoxes || ['Box#1'],
      stats: data.stats || {},
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await userRef.set(userData, { merge: true });
    res.json({ result: { success: true } });
  } catch (error) {
    console.error('Error in syncUserData:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.getUserData = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.json({ result: null });
      return;
    }

    res.json({ result: userDoc.data() });
  } catch (error) {
    console.error('Error in getUserData:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.resetUserData = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { displayName } = req.body.data || {};
    const userRef = db.collection('users').doc(userId);
    
    const resetData = {
      displayName: displayName || 'Anonym',
      totalXP: 0,
      totalBoxesOpened: 0,
      mythicsFound: 0,
      aethericsFound: 0,
      balance: 500,
      playerLevel: 0,
      playerXP: 0,
      totalXPEarned: 0,
      skillPoints: 0,
      skills: { wohlstand: 0, glueck: 0, effizienz: 0 },
      prestigeLevel: 0,
      runBoxesOpened: 0,
      activeBoosts: {},
      permanentUpgrades: {},
      purchasedItems: [],
      statUpgradesLevels: { wealth: 0, luck: 0, tempo: 0 },
      keysInventory: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 },
      boxType: 'Box#1',
      unlockedBoxes: ['Box#1'],
      stats: {},
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await userRef.set(resetData);
    res.json({ result: { success: true } });
  } catch (error) {
    console.error('Error in resetUserData:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.updateStats = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const stats = req.body.data;
    if (!stats || typeof stats !== 'object') {
      res.status(400).json({ error: 'Invalid stats data' });
      return;
    }

    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      ...stats,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ result: { success: true } });
  } catch (error) {
    console.error('Error in updateStats:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.setDisplayName = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { name } = req.body.data;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }

    // Längenprüfung
    if (name.trim().length < 2 || name.length > 20) {
      res.status(400).json({ error: 'Name must be 2-20 characters' });
      return;
    }

    // Schimpfwortfilter
    if (containsProfanity(name)) {
      res.status(400).json({ error: 'Inappropriate name detected' });
      return;
    }

    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      displayName: name.trim(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ result: { success: true } });
  } catch (error) {
    console.error('Error in setDisplayName:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.prestige = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ error: 'User data not found' });
      return;
    }

    const userData = userDoc.data();
    const currentPrestige = userData.prestigeLevel || 0;
    const { mythicsFound, aethericsFound, runBoxesOpened } = userData;
    
    let requiredMythics = 0;
    let requiredAetherics = 0;
    
    if (currentPrestige < 10) {
      requiredMythics = 5;
    } else if (currentPrestige < 20) {
      requiredAetherics = 1;
    } else if (currentPrestige < 30) {
      requiredAetherics = 2;
    } else {
      requiredAetherics = 3;
    }
    
    const requiredBoxes = 200;

    if (currentPrestige < 10 && (mythicsFound || 0) < requiredMythics) {
      res.status(403).json({ error: `Need ${requiredMythics} Mythic items` });
      return;
    }

    if (currentPrestige >= 10 && (aethericsFound || 0) < requiredAetherics) {
      res.status(403).json({ error: `Need ${requiredAetherics} Aetherisch items` });
      return;
    }

    if ((runBoxesOpened || 0) < requiredBoxes) {
      res.status(403).json({ error: `Need ${requiredBoxes} boxes opened this run` });
      return;
    }

    const newPrestigeLevel = currentPrestige + 1;

    await userRef.update({
      prestigeLevel: newPrestigeLevel,
      prestigeTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      runBoxesOpened: 0,
    });

    res.json({ 
      result: {
        success: true, 
        newLevel: newPrestigeLevel,
        bonuses: {
          valueBoost: newPrestigeLevel * 5,
          luckBoost: newPrestigeLevel,
          timeReduction: newPrestigeLevel * 2,
        }
      }
    });
  } catch (error) {
    console.error('Error in prestige:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.getLeaderboard = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'User must be authenticated' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    await admin.auth().verifyIdToken(token);

    const limit = req.body.data?.limit || 50;

    const snapshot = await db.collection('users')
      .orderBy('prestigeLevel', 'desc')
      .orderBy('totalXP', 'desc')
      .limit(Math.min(limit, 100))
      .get();

    const leaderboard = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const displayName = data.displayName || 'Anonym';
      
      // Nur Benutzer mit gesetztem Namen anzeigen (nicht "Anonym")
      if (displayName !== 'Anonym') {
        leaderboard.push({
          uid: doc.id,
          displayName: displayName,
          totalXP: data.totalXP || 0,
          totalBoxesOpened: data.totalBoxesOpened || 0,
          prestigeLevel: data.prestigeLevel || 0,
          mythicsFound: data.mythicsFound || 0,
          aethericsFound: data.aethericsFound || 0
        });
      }
    });

    res.json({ result: leaderboard });
  } catch (error) {
    console.error('Error in getLeaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});
