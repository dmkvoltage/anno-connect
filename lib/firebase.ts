//firebase.ts
import "react-native-get-random-values";
import { getApp, getApps, initializeApp, FirebaseApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBGwhj5icQLJ-nT9b0_ByWWfHJixrqYBWI",
  authDomain: "kingoauth-25355.firebaseapp.com",
  projectId: "kingoauth-25355",
  storageBucket: "kingoauth-25355.appspot.com",
  messagingSenderId: "350746585050",
  appId: "1:350746585050:android:71d27027535ee04a5ec2e3",
};

// Initialize app
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize auth with persistence
let auth: Auth;
try {
  // Try to initialize with AsyncStorage persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  // If already initialized (hot reload), get the existing instance
  console.log("Auth already initialized, using existing instance");
  auth = getAuth(app);
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export { auth };
export default app;