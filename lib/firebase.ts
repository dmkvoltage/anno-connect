import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBGwhj5icQLJ-nT9b0_ByWWfHJixrqYBWI",
  authDomain: "kingoauth-25355.firebaseapp.com",
  projectId: "kingoauth-25355",
  storageBucket: "kingoauth-25355.appspot.com",
  messagingSenderId: "350746585050",
  appId: "1:350746585050:android:71d27027535ee04a5ec2e3",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
export default firebase;
