"use strict";
/* ---------- Firestore sync module ----------
   Real-time cloud sync with offline persistence.
   Each user's data lives in /users/{uid}/{collection}. */

const CDN = "https://www.gstatic.com/firebasejs/11.8.1";

let _db = null;
let _unsubscribers = [];
let _saveTimers = {};

async function getFirestoreModule() {
  const { getFirestore, doc, getDoc, setDoc, onSnapshot } =
    await import(/* @vite-ignore */ `${CDN}/firebase-firestore.js`);
  return { getFirestore, doc, getDoc, setDoc, onSnapshot };
}

let _fsm = null;
async function fsm() {
  if (_fsm) return _fsm;
  _fsm = await getFirestoreModule();
  return _fsm;
}

export async function initSync(app) {
  const m = await fsm();
  _db = m.getFirestore(app);
  // Firebase v11+ enables IndexedDB persistence by default — no explicit call needed.
  return _db;
}

/* Save data to Firestore. Debounced to avoid excessive writes. */
export async function saveToCloud(userId, collection, data) {
  if (!_db || !userId) return false;
  const m = await fsm();
  // Debounce: cancel any pending save for this collection, schedule a new one.
  // Settle the superseded promise (false) so its awaiter doesn't hang forever.
  const key = `${userId}/${collection}`;
  const prev = _saveTimers[key];
  if (prev) { clearTimeout(prev.timer); prev.resolve(false); }
  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      delete _saveTimers[key];
      try {
        const ref = m.doc(_db, "users", userId, collection, "data");
        await m.setDoc(ref, { ...data, _updated: Date.now() }, { merge: true });
        resolve(true);
      } catch (e) {
        console.warn("Sync write failed:", e.message);
        resolve(false);
      }
    }, 400); // 400ms debounce
    _saveTimers[key] = { timer, resolve };
  });
}

/* One-time read from Firestore */
export async function loadFromCloud(userId, collection) {
  if (!_db || !userId) return null;
  const m = await fsm();
  try {
    const ref = m.doc(_db, "users", userId, collection, "data");
    // Add a timeout because getDoc hangs forever if the Firestore database hasn't been created
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout — did you create the database in the Firebase Console?")), 5000));
    const snap = await Promise.race([m.getDoc(ref), timeout]);
    
    if (snap.exists()) {
      const data = snap.data();
      delete data._updated; // strip internal field
      return data;
    }
    return null;
  } catch (e) {
    console.warn("Sync read failed:", e.message);
    throw e; // rethrow so app.js can catch it and display it!
  }
}

/* Real-time listener for live cross-device sync.
   `callback(data)` fires whenever the cloud doc changes. */
export async function listenToCloud(userId, collection, callback) {
  if (!_db || !userId) return ()=>{};
  const m = await fsm();
  const ref = m.doc(_db, "users", userId, collection, "data");
  const unsub = m.onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      delete data._updated;
      callback(data);
    }
  }, (err) => {
    console.warn(`Sync listener error (${collection}):`, err.message);
  });
  _unsubscribers.push(unsub);
  return unsub;
}

/* Clean up all listeners (on sign-out) */
export function stopAllListeners() {
  for (const unsub of _unsubscribers) {
    try { unsub(); } catch (e) {}
  }
  _unsubscribers = [];
  // Cancel all pending saves (settle their promises so awaiters don't hang)
  for (const key of Object.keys(_saveTimers)) {
    clearTimeout(_saveTimers[key].timer);
    _saveTimers[key].resolve(false);
    delete _saveTimers[key];
  }
}

/* One-time migration: push existing localStorage data to Firestore.
   Only runs if the user's Firestore doc doesn't exist yet. */
export async function migrateLocalStorage(userId) {
  if (!_db || !userId) return;

  const collections = [
    { key: "dayplanner:v1", collection: "planner" },
    { key: "shoppinglist:v1", collection: "shopping" },
    { key: "finance:v1", collection: "finance" },
    { key: "mealplan:v1", collection: "kitchen" },
  ];

  for (const { key, collection } of collections) {
    try {
      // Check if cloud already has data
      const cloud = await loadFromCloud(userId, collection);
      if (cloud) continue; // already has data, skip

      // Check localStorage
      const local = localStorage.getItem(key);
      if (!local) continue;

      const data = JSON.parse(local);
      await saveToCloud(userId, collection, data);
      console.log(`Migrated ${key} → Firestore/${collection}`);
    } catch (e) {
      console.warn(`Migration failed for ${key}:`, e.message);
    }
  }
}
