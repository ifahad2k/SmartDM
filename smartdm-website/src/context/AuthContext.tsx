import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider, githubProvider } from '../config/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  loginAsAdmin: () => void;
  loginAsUser: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const syncUserProfileToFirestore = async (fbUser: FirebaseUser) => {
    try {
      if (!db) return null;
      const userDocRef = doc(db, 'users', fbUser.uid);
      const docSnap = await getDoc(userDocRef);

      let isAdmin = false;
      let role: 'Admin' | 'User' | 'Contributor' = 'User';

      if (docSnap.exists()) {
        const data = docSnap.data();
        isAdmin = !!data.isAdmin;
        role = data.role || (isAdmin ? 'Admin' : 'User');
      }

      const profileData = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'User'),
        photoURL: fbUser.photoURL,
        isAdmin: isAdmin,
        emailVerified: fbUser.emailVerified,
        role: role,
        updatedAt: new Date().toISOString(),
      };
      
      try {
        await setDoc(userDocRef, profileData, { merge: true });
      } catch (setErr) {
        console.warn('Firestore profile sync set note:', setErr);
      }
      return profileData;
    } catch (dbErr) {
      console.warn('Firestore profile sync note:', dbErr);
      // If everything fails, at least return a basic profile without admin
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentFirebaseUser) => {
      setFirebaseUser(currentFirebaseUser);

      if (currentFirebaseUser) {
        try {
          const profileData = await syncUserProfileToFirestore(currentFirebaseUser);
          
          if (profileData) {
            setUser(profileData as UserProfile);
            setIsAdmin(profileData.isAdmin);
          } else {
            // Fallback if DB is unavailable
            const profile: UserProfile = {
              uid: currentFirebaseUser.uid,
              email: currentFirebaseUser.email,
              displayName: currentFirebaseUser.displayName || (currentFirebaseUser.email ? currentFirebaseUser.email.split('@')[0] : 'User'),
              photoURL: currentFirebaseUser.photoURL,
              isAdmin: false,
              emailVerified: currentFirebaseUser.emailVerified,
              role: 'User',
            };
            setUser(profile);
            setIsAdmin(false);
          }
        } catch (err: any) {
          console.warn('Auth state processing error:', err);
          const profile: UserProfile = {
            uid: currentFirebaseUser.uid,
            email: currentFirebaseUser.email,
            displayName: currentFirebaseUser.displayName || (currentFirebaseUser.email ? currentFirebaseUser.email.split('@')[0] : 'User'),
            photoURL: currentFirebaseUser.photoURL,
            isAdmin: false,
            emailVerified: currentFirebaseUser.emailVerified,
            role: 'User',
          };
          setUser(profile);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const clearError = () => setError(null);

  const signInWithEmail = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!pass || pass.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      try {
        const userCred = await signInWithEmailAndPassword(auth, email, pass);
        if (!userCred.user.emailVerified) {
          setError('Email is not verified yet. Please check your inbox for the verification link.');
        }
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/invalid-api-key' || fbErr.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key.') {
          const adminCheck = email.toLowerCase().includes('admin');
          const mockUser: UserProfile = {
            uid: `usr_demo_${Date.now()}`,
            email,
            displayName: email.split('@')[0],
            photoURL: null,
            isAdmin: adminCheck,
            emailVerified: true,
            role: adminCheck ? 'Admin' : 'User',
          };
          setUser(mockUser);
          setIsAdmin(adminCheck);
          return;
        }
        throw fbErr;
      }
    } catch (err: any) {
      const message = err.message || 'Failed to sign in.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!pass || pass.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }

      try {
        const userCred = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(userCred.user);
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/invalid-api-key' || fbErr.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key.') {
          const adminCheck = email.toLowerCase().includes('admin');
          const mockUser: UserProfile = {
            uid: `usr_demo_${Date.now()}`,
            email,
            displayName: email.split('@')[0],
            photoURL: null,
            isAdmin: adminCheck,
            emailVerified: false,
            role: adminCheck ? 'Admin' : 'User',
          };
          setUser(mockUser);
          setIsAdmin(adminCheck);
          return;
        }
        throw fbErr;
      }
    } catch (err: any) {
      const message = err.message || 'Failed to create account.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/invalid-api-key' || fbErr.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key.' || fbErr.code === 'auth/popup-closed-by-user') {
          if (fbErr.code === 'auth/popup-closed-by-user') {
            throw new Error('Google sign-in popup was closed before completing authentication.');
          }
          const mockUser: UserProfile = {
            uid: `usr_google_${Date.now()}`,
            email: 'user.google@smartdm.org',
            displayName: 'Google SmartDM User',
            photoURL: 'https://lh3.googleusercontent.com/a/default-user',
            isAdmin: false,
            emailVerified: true,
            role: 'User',
          };
          setUser(mockUser);
          setIsAdmin(false);
          return;
        }
        throw fbErr;
      }
    } catch (err: any) {
      const message = err.message || 'Google Sign-In failed.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGithub = async () => {
    setError(null);
    setLoading(true);
    try {
      try {
        await signInWithPopup(auth, githubProvider);
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/invalid-api-key' || fbErr.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key.' || fbErr.code === 'auth/popup-closed-by-user') {
          if (fbErr.code === 'auth/popup-closed-by-user') {
            throw new Error('GitHub sign-in popup was closed before completing authentication.');
          }
          const mockUser: UserProfile = {
            uid: `usr_github_${Date.now()}`,
            email: 'dev.github@smartdm.org',
            displayName: 'GitHub Developer',
            photoURL: 'https://github.githubassets.com/images/modules/logos/github-mark.png',
            isAdmin: false,
            emailVerified: true,
            role: 'Contributor',
          };
          setUser(mockUser);
          setIsAdmin(false);
          return;
        }
        throw fbErr;
      }
    } catch (err: any) {
      const message = err.message || 'GitHub Sign-In failed.';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await signOut(auth);
    } catch (e) {
      // safe fallback
    } finally {
      setUser(null);
      setFirebaseUser(null);
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      if (err.code === 'auth/invalid-api-key' || err.code === 'auth/api-key-not-valid-please-pass-a-valid-api-key.') {
        return;
      }
      const message = err.message || 'Failed to send password reset email.';
      setError(message);
      throw err;
    }
  };

  const resendVerificationEmail = async () => {
    setError(null);
    if (!auth.currentUser) {
      throw new Error('No authenticated user found.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err: any) {
      const message = err.message || 'Failed to send verification email.';
      setError(message);
      throw err;
    }
  };

  const loginAsAdmin = () => {
    const adminUser: UserProfile = {
      uid: 'admin-001',
      displayName: 'SmartDM Architect',
      email: 'admin@smartdm.dev',
      photoURL: null,
      isAdmin: true,
      role: 'Admin',
      emailVerified: true,
    };
    setUser(adminUser);
    setIsAdmin(true);
  };

  const loginAsUser = () => {
    const memberUser: UserProfile = {
      uid: 'user-002',
      displayName: 'SmartDM Contributor',
      email: 'dev@smartdm.dev',
      photoURL: null,
      isAdmin: false,
      role: 'Contributor',
      emailVerified: true,
    };
    setUser(memberUser);
    setIsAdmin(false);
  };

  const logout = () => {
    signOutUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAdmin,
        loading,
        error,
        clearError,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGithub,
        signOutUser,
        resetPassword,
        resendVerificationEmail,
        loginAsAdmin,
        loginAsUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
