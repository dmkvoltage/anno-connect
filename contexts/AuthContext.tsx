import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import firebase from "firebase/compat/app";
import { auth, db } from "@/lib/firebase";

type FirebaseUser = firebase.User;
import { doc, setDoc, getDoc } from "firebase/firestore";
import { generateRandomUsername } from "@/lib/username-generators";
import { getRandomAvatar } from "@/constants/avatars";
import type { UserProfile } from "@/types/user";

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

const USER_PROFILE_STORAGE_KEY = "userProfile";
const AUTH_TOKEN_STORAGE_KEY = "authToken";

// Helper to revive Date objects from JSON
const reviveDates = (obj: any): any => {
  if (obj && typeof obj === "object") {
    if (obj.joinDate) obj.joinDate = new Date(obj.joinDate);
    if (obj.lastSeen) obj.lastSeen = new Date(obj.lastSeen);
    // Recursively handle nested objects if needed
  }
  return obj;
};

export const [AuthProvider, useAuth] = createContextHook<AuthContextType>(
  () => {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      const initializeAuth = async () => {
        // Load user profile from AsyncStorage first for faster loading
        try {
          const storedProfile = await AsyncStorage.getItem(
            USER_PROFILE_STORAGE_KEY
          );
          if (storedProfile) {
            setUserProfile(reviveDates(JSON.parse(storedProfile)));
          }
        } catch (error) {
          console.error("Error loading user profile from storage:", error);
        }

        // Set up Firebase auth listener
        const unsubscribe = auth.onAuthStateChanged(
          async (firebaseUser: FirebaseUser | null) => {
            console.log("Auth state changed:", firebaseUser?.uid);
            setUser(firebaseUser);

            if (firebaseUser) {
              try {
                const userDoc = await getDoc(
                  doc(db, "users", firebaseUser.uid)
                );
                const idToken = await firebaseUser.getIdToken();
                await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, idToken);
                if (userDoc.exists()) {
                  const profileData = userDoc.data() as UserProfile;
                  setUserProfile(profileData);
                  // Store in AsyncStorage for persistence
                  await AsyncStorage.setItem(
                    USER_PROFILE_STORAGE_KEY,
                    JSON.stringify(profileData)
                  );
                }
              } catch (error) {
                console.error("Error fetching user profile:", error);
              }
            } else {
              setUserProfile(null);
              // Clear stored profile and token on sign out
              await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);
              await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            }

            setIsLoading(false);
          }
        );

        return unsubscribe;
      };

      const unsubscribePromise = initializeAuth();

      return () => {
        unsubscribePromise.then((unsubscribe) => unsubscribe());
      };
    }, []);

    const signIn = async (email: string, password: string) => {
      try {
        await auth.signInWithEmailAndPassword(email, password);
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
        const userCredential = await auth.createUserWithEmailAndPassword(
          email,
          password
        );

        const username = generateRandomUsername();
        const avatar = getRandomAvatar(gender);

        const userDoc = {
          id: userCredential.user!.uid,
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

        await setDoc(doc(db, "users", userCredential.user!.uid), userDoc);
      } catch (error) {
        console.error("Sign up error:", error);
        throw error;
      }
    };

    const signOut = async () => {
      try {
        await auth.signOut();
      } catch (error) {
        console.error("Sign out error:", error);
        throw error;
      }
    };

    return {
      user,
      userProfile,
      isLoading,
      signIn,
      signUp,
      signOut,
    };
  }
);
