//AuthContext.tsx
import { getRandomAvatar } from "@/constants/avatars";
import { db, auth } from "@/lib/firebase";
import { generateRandomUsername } from "@/lib/username-generators";
import type { UserProfile } from "@/types/user";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser,
  getIdToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState
} from "react";
import React from "react";

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    gender: "male" | "female" | "other"
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_PROFILE_STORAGE_KEY = "userProfile";
const AUTH_TOKEN_STORAGE_KEY = "authToken";

// Helper to revive Date objects from JSON
const reviveDates = (obj: any): any => {
  if (obj && typeof obj === "object") {
    if (obj.joinDate) obj.joinDate = new Date(obj.joinDate);
    if (obj.lastSeen) obj.lastSeen = new Date(obj.lastSeen);
  }
  return obj;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Debug: Check AsyncStorage contents
    (async () => {
      const keys = await AsyncStorage.getAllKeys();
      const data = await AsyncStorage.multiGet(keys);
      console.log('AsyncStorage contents:', data);
    })();

    // Load cached profile immediately
    (async () => {
      try {
        const storedProfile = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
        if (storedProfile) {
          console.log('Loaded cached profile from AsyncStorage');
          setUserProfile(reviveDates(JSON.parse(storedProfile)));
        } else {
          console.log('No cached profile found in AsyncStorage');
        }
      } catch (e) {
        console.error("Error loading cached profile:", e);
      }
    })();

    // Set up Firebase auth listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.uid);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          const idToken = await getIdToken(firebaseUser);
          console.log("Firebase ID Token retrieved (last 10 chars):", idToken.slice(-10));
          await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, idToken);
          
          if (userDoc.exists()) {
            const profileData = userDoc.data() as UserProfile;
            setUserProfile(profileData);
            await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profileData));
            console.log('Saved profile to AsyncStorage');
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        console.log("User signed out, clearing tokens");
        setUserProfile(null);
        await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);
        await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    gender: "male" | "female" | "other"
  ) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const username = generateRandomUsername();
      const avatar = getRandomAvatar(gender);

      const userDoc = {
        id: userCredential.user.uid,
        username,
        gender,
        avatar,
        rating: 0,
        totalRatings: 0,
        verified: false,
        connectionCount: 0,
        joinDate: new Date(),
        status: "online" as const,
        lastSeen: new Date(),
        email: email || null,
        connections: [],
        blockedUsers: [],
        reportCount: 0,
      };

      await setDoc(doc(db, "users", userCredential.user.uid), userDoc);
    } catch (error) {
      console.error("Sign up error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        isLoading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}