import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { generateRandomUsername } from '@/lib/username-generators';
import { getRandomAvatar } from '@/constants/avatars';
import type { UserProfile } from '@/types/user';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, gender: 'male' | 'female' | 'other') => Promise<void>;
  signOut: () => Promise<void>;
}

export const [AuthProvider, useAuth] = createContextHook<AuthContextType>(() => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser?.uid);
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        setUserProfile(null);
      }
      
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, gender: 'male' | 'female' | 'other') => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

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
        status: 'online' as const,
        lastSeen: new Date(),
        email: email || null,
        connections: [],
        blockedUsers: [],
        reportCount: 0,
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), userDoc);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
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
});
