// Firebase SDK Integration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged, linkWithCredential, EmailAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js';
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Initialize App Check with reCAPTCHA v3 (nur in Production)
let appCheck;
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6Ld7Og8sAAAAAIMJUJuFYJW8Gon7Io88Smysbql7'),
      isTokenAutoRefreshEnabled: true
    });
  } catch (e) {
    console.warn('App Check initialization failed:', e);
  }
} else {
  console.log('App Check disabled for localhost');
}

// Cloud Functions endpoint
const FUNCTIONS_REGION = 'us-central1';
const PROJECT_ID = 'looting-simulator-90463';
const FUNCTIONS_URL = `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net`;

// Helper to call Cloud Functions (Callable format)
async function callFunction(functionName, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ data })  // Callable functions expect {data: ...}
  });
  
  if (!response.ok) {
    let errorMessage = 'Cloud Function failed';
    try {
      const errorData = await response.json();
      // Extract message from Firebase callable error format
      errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status}`;
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  
  const result = await response.json();
  return result.result;  // Callable functions return {result: ...}
}

// State
let currentUser = null;
let isReady = false;
const readyPromise = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      isReady = true;
      resolve();
    } else {
      // Auto sign-in anonymously
      signInAnonymously(auth).then(() => {
        isReady = true;
        resolve();
      }).catch((error) => {
        console.error('Firebase auth error:', error);
        isReady = true;
        resolve();
      });
    }
  });
});

// API for script.js
window.firebaseApi = {
  // Wait for Firebase to be ready
  ready: () => readyPromise,
  
  // Get current user ID
  getCurrentUid: () => currentUser?.uid || null,
  
  // Sync complete user data
  syncUserData: async (gameData) => {
    return await callFunction('syncUserData', gameData);
  },
  
  // Get complete user data
  getUserData: async () => {
    return await callFunction('getUserData', {});
  },
  
  // Reset user data
  resetUserData: async (displayName) => {
    return await callFunction('resetUserData', { displayName });
  },
  
  // Update player stats via Cloud Function (legacy, for leaderboard)
  updateStats: async (stats) => {
    return await callFunction('updateStats', stats);
  },
  
  // Set display name via Cloud Function
  setDisplayName: async (name) => {
    const result = await callFunction('setDisplayName', { name });
    localStorage.setItem('playerDisplayName', name);
    return result;
  },
  
  // Fetch global leaderboard via Cloud Function
  fetchGlobalLeaderboard: async (limitCount = 50) => {
    return await callFunction('getLeaderboard', { limit: limitCount });
  },
  
  // Friends management (placeholder - not implemented in Cloud Functions yet)
  addFriend: async (friendUid) => {
    console.warn('Friends feature not yet implemented');
  },
  
  removeFriend: async (friendUid) => {
    console.warn('Friends feature not yet implemented');
  },
  
  fetchFriendsUids: async () => {
    return [];
  },
  
  fetchFriendsLeaderboard: async (limitCount = 50) => {
    return [];
  },
  
  // Prestige via Cloud Function
  callPrestige: async () => {
    return await callFunction('prestige', {});
  },
  
  // Account Linking: Upgrade anonymous account to email/password
  linkAccountWithEmail: async (email, password) => {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');
    if (!user.isAnonymous) throw new Error('User is already linked to an account');
    
    const credential = EmailAuthProvider.credential(email, password);
    const result = await linkWithCredential(user, credential);
    return { success: true, user: result.user };
  },
  
  // Sign in with email/password
  signInWithEmail: async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    currentUser = result.user;
    return { success: true, user: result.user };
  },
  
  // Create new account with email/password
  createAccountWithEmail: async (email, password) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    currentUser = result.user;
    return { success: true, user: result.user };
  },
  
  // Check if current user is anonymous
  isAnonymous: () => {
    return currentUser?.isAnonymous || false;
  },
  
  // Get current user email
  getUserEmail: () => {
    return currentUser?.email || null;
  }
};

// Sign out method (separate export)
window.firebaseApi.signOut = async () => {
  try {
    await signOut(auth);
    // After sign out, Firebase will auto sign-in anonymously
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

console.log('Firebase initialized');
