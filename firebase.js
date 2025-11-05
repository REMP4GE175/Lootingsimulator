(function(){
  const cfg = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) ? window.FIREBASE_CONFIG : null;
  let _app = null;
  let _auth = null;
  let _db = null;
  let _functions = null;
  let _readyResolve;
  const _ready = new Promise(res => { _readyResolve = res; });

  function hasValidConfig(c) {
    return c && typeof c === 'object' && c.apiKey && c.projectId;
  }

  function getLocalName() {
    try {
      const k = 'lootsim_playerDisplayName';
      let n = localStorage.getItem(k);
      if (!n) {
        // Generate simple readable anon name
        const id = Math.random().toString(36).slice(2, 8).toUpperCase();
        n = 'Anon-' + id;
        localStorage.setItem(k, n);
      }
      return n;
    } catch (_) {
      return 'Anon';
    }
  }

  async function ensureUserDoc(uid) {
    if (!_db || !uid) return;
    try {
      const ref = _db.collection('users').doc(uid);
      const snap = await ref.get();
      const now = new Date();
      if (!snap.exists) {
        await ref.set({
          displayName: getLocalName(),
          prestigeLevel: 0,
          totalXP: 0,
          mythicsFound: 0,
          totalBoxesOpened: 0,
          createdAt: now,
          lastSeenAt: now
        }, { merge: true });
      } else {
        await ref.set({ lastSeenAt: now, displayName: getLocalName() }, { merge: true });
      }
    } catch (e) {
      console.warn('ensureUserDoc failed', e);
    }
  }

  async function init() {
    if (!hasValidConfig(cfg)) {
      console.warn('[Firebase] Missing/invalid config. Leaderboard disabled until configured.');
      _readyResolve();
      return;
    }
    try {
      _app = firebase.initializeApp(cfg);
      _auth = firebase.auth();
      _db = firebase.firestore();
  _functions = firebase.functions();

      // Optional: enable local persistence
      try { await _db.enablePersistence({ synchronizeTabs: true }); } catch (_) {}

      // Sign-in anonymously
      if (!_auth.currentUser) {
        await _auth.signInAnonymously();
      }
      const uid = _auth.currentUser && _auth.currentUser.uid;
      await ensureUserDoc(uid);

      _readyResolve();
    } catch (e) {
      console.error('[Firebase] init/sign-in failed', e);
      _readyResolve();
    }
  }

  async function updateStats(stats) {
    if (!_db || !_auth || !_auth.currentUser) return;
    const uid = _auth.currentUser.uid;
    const ref = _db.collection('users').doc(uid);
    const now = new Date();
    const payload = {
      lastSeenAt: now,
    };
    if (typeof stats === 'object' && stats) {
      if (typeof stats.displayName === 'string' && stats.displayName) payload.displayName = stats.displayName;
      if (Number.isFinite(stats.totalXP)) payload.totalXP = stats.totalXP;
      if (Number.isFinite(stats.mythicsFound)) payload.mythicsFound = stats.mythicsFound;
      if (Number.isFinite(stats.totalBoxesOpened)) payload.totalBoxesOpened = stats.totalBoxesOpened;
    }
    try { await ref.set(payload, { merge: true }); } catch (e) { console.warn('updateStats failed', e); }
  }

  async function callPrestige() {
    if (!_functions || !_auth || !_auth.currentUser) throw new Error('Not ready');
    try {
      const fn = _functions.httpsCallable('submitPrestige');
      const res = await fn({});
      const data = res && res.data ? res.data : {};
      return { prestigeLevel: Number(data.prestigeLevel || 0) };
    } catch (e) {
      console.warn('callPrestige failed', e);
      throw e;
    }
  }

  async function setDisplayName(displayName) {
    if (!_functions || !_auth || !_auth.currentUser) throw new Error('Not ready');
    try {
      const fn = _functions.httpsCallable('setDisplayName');
      const res = await fn({ displayName: String(displayName || '') });
      return res && res.data ? res.data : { ok: true };
    } catch (e) {
      console.warn('setDisplayName failed', e);
      throw e;
    }
  }

  async function fetchGlobalLeaderboard(limit = 50) {
    if (!_db) return [];
    try {
      const q = await _db.collection('users')
        .orderBy('prestigeLevel', 'desc')
        .limit(limit)
        .get();
      const rows = [];
      q.forEach(doc => {
        const d = doc.data() || {};
        rows.push({
          uid: doc.id,
          displayName: d.displayName || 'Anon',
          prestigeLevel: d.prestigeLevel || 0,
          totalXP: d.totalXP || 0,
          mythicsFound: d.mythicsFound || 0,
          totalBoxesOpened: d.totalBoxesOpened || 0,
        });
      });
      return rows;
    } catch (e) {
      console.warn('fetchGlobalLeaderboard failed', e);
      return [];
    }
  }

  function getCurrentUid() {
    try { return _auth && _auth.currentUser ? _auth.currentUser.uid : null; } catch (_) { return null; }
  }

  async function addFriend(friendUid) {
    if (!_db || !friendUid) return false;
    const uid = getCurrentUid();
    if (!uid || uid === friendUid) return false;
    try {
      const ref = _db.collection('users').doc(uid).collection('friends').doc(friendUid);
      await ref.set({ sinceAt: new Date() }, { merge: true });
      return true;
    } catch (e) {
      console.warn('addFriend failed', e);
      return false;
    }
  }

  async function removeFriend(friendUid) {
    if (!_db || !friendUid) return false;
    const uid = getCurrentUid();
    if (!uid) return false;
    try {
      const ref = _db.collection('users').doc(uid).collection('friends').doc(friendUid);
      await ref.delete();
      return true;
    } catch (e) {
      console.warn('removeFriend failed', e);
      return false;
    }
  }

  async function fetchFriendsUids() {
    if (!_db) return [];
    const uid = getCurrentUid();
    if (!uid) return [];
    try {
      const snap = await _db.collection('users').doc(uid).collection('friends').get();
      const ids = [];
      snap.forEach(d => ids.push(d.id));
      return ids;
    } catch (e) {
      console.warn('fetchFriendsUids failed', e);
      return [];
    }
  }

  async function fetchFriendsLeaderboard(limit = 50) {
    if (!_db) return [];
    const ids = await fetchFriendsUids();
    if (!ids || ids.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < ids.length && i < limit; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }
    const rows = [];
    try {
      for (const chunk of chunks) {
        const q = await _db.collection('users')
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        q.forEach(doc => {
          const d = doc.data() || {};
          rows.push({
            uid: doc.id,
            displayName: d.displayName || 'Anon',
            prestigeLevel: d.prestigeLevel || 0,
            totalXP: d.totalXP || 0,
            mythicsFound: d.mythicsFound || 0,
            totalBoxesOpened: d.totalBoxesOpened || 0,
          });
        });
      }
      rows.sort((a,b) => (b.prestigeLevel||0) - (a.prestigeLevel||0));
      return rows.slice(0, limit);
    } catch (e) {
      console.warn('fetchFriendsLeaderboard failed', e);
      return [];
    }
  }

  // Expose a small API to the app
  window.firebaseApi = {
    ready: () => _ready,
    updateStats,
    fetchGlobalLeaderboard,
    fetchFriendsLeaderboard,
    addFriend,
    removeFriend,
    fetchFriendsUids,
    getCurrentUid,
    callPrestige,
    setDisplayName,
  };

  // Start init immediately
  try { init(); } catch (e) { console.error('Firebase init error', e); _readyResolve(); }
})();
