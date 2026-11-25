import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/database';

// This interface defines the values exposed by the authentication context.
interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// This context holds the current authentication state and actions.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// This provider component listens to auth state changes and supplies session data to children.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // This function loads the candidate profile corresponding to the current user.
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load profile record', error.message);
        return;
      }

      if (!data) {
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .upsert({ id: userId })
          .select('*')
          .maybeSingle();

        if (createError) {
          console.error('Failed to auto create profile record', createError.message);
          return;
        }

        setProfile(createdProfile as Profile | null);
        return;
      }

      setProfile(data as Profile | null);
    } catch (err) {
      console.error('Unexpected error while fetching profile', err);
    }
  };

  // This function refreshes the profile data on demand.
  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  // This effect checks the initial session and subscribes to auth state changes.
  useEffect(() => {
    let isMounted = true;

    // This function retrieves the persisted session on startup.
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Failed to retrieve initial session', error.message);
        }
        if (isMounted) {
          setSession(initialSession);
          if (initialSession?.user?.id) {
            await fetchProfile(initialSession.user.id);
          }
        }
      } catch (err) {
        console.error('Unexpected error during session recovery', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // This listener reacts to session updates such as sign in or token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        if (!isMounted) {
          return;
        }
        setSession(currentSession);
        if (currentSession?.user?.id) {
          await fetchProfile(currentSession.user.id);
        } else {
          setProfile(null);
        }
        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // This function signs out the user and clears all cached session data.
  const signOut = async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    } catch (err) {
      console.error('Failed to complete sign out', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        isLoading,
        signOut,
        refreshProfile,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

// This hook provides convenient access to the auth context across the app.
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
