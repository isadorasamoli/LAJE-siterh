import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
// Note: Sensitive scopes (gmail.send, calendar.events) are excluded from the main login
// provider to prevent Google OAuth 403: access_denied / unverified app errors for members.
