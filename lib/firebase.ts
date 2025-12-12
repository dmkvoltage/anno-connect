import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBGwhj5icQLJ-nT9b0_ByWWfHJixrqYBWI",
  authDomain: "kingoauth-25355.firebaseapp.com",
  projectId: "kingoauth-25355",
  storageBucket: "kingoauth-25355.appspot.com",
  messagingSenderId: "350746585050",
  appId: "1:350746585050:android:71d27027535ee04a5ec2e3"
};

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);

export const db = getFirestore(app);
export const storage = getStorage(app);
export { auth };
export default app;
