"use strict";
/* ---------- Firebase Auth module ----------
   Handles Google + Email/Password sign-in, sign-out, and auth state.
   Firebase SDK loaded via CDN ESM imports. */

const CDN = "https://www.gstatic.com/firebasejs/11.8.1";
let _auth = null;
let _app = null;

async function getFirebaseModules() {
  const { initializeApp } = await import(/* @vite-ignore */ `${CDN}/firebase-app.js`);
  const { getAuth, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
          sendPasswordResetEmail, signOut: fbSignOut, onAuthStateChanged: fbOnAuthStateChanged,
          GoogleAuthProvider, updateProfile } =
    await import(/* @vite-ignore */ `${CDN}/firebase-auth.js`);
  return { initializeApp, getAuth, signInWithPopup, signInWithEmailAndPassword,
           createUserWithEmailAndPassword, sendPasswordResetEmail, fbSignOut,
           fbOnAuthStateChanged, GoogleAuthProvider, updateProfile };
}

let _fb = null;
async function fb() {
  if (_fb) return _fb;
  _fb = await getFirebaseModules();
  return _fb;
}

export function isConfigured() {
  const c = window.FIREBASE_CONFIG;
  return c && c.apiKey && c.apiKey.length > 0;
}

export async function initAuth() {
  if (!isConfigured()) return null;
  const m = await fb();
  _app = m.initializeApp(window.FIREBASE_CONFIG);
  _auth = m.getAuth(_app);
  // Enable persistence for offline
  _auth.useDeviceLanguage();
  return _auth;
}

export function getApp() { return _app; }
export function getAuthInstance() { return _auth; }

export async function signInWithGoogle() {
  const m = await fb();
  const provider = new m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return m.signInWithPopup(_auth, provider);
}

export async function signInWithEmail(email, password) {
  const m = await fb();
  return m.signInWithEmailAndPassword(_auth, email, password);
}

export async function signUpWithEmail(email, password, displayName) {
  const m = await fb();
  const cred = await m.createUserWithEmailAndPassword(_auth, email, password);
  if (displayName) {
    await m.updateProfile(cred.user, { displayName });
  }
  return cred;
}

export async function resetPassword(email) {
  const m = await fb();
  return m.sendPasswordResetEmail(_auth, email);
}

export async function signOut() {
  const m = await fb();
  return m.fbSignOut(_auth);
}

export async function onAuthStateChanged(callback) {
  const m = await fb();
  return m.fbOnAuthStateChanged(_auth, callback);
}
