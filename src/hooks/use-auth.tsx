import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import {
  ApiError,
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
  type AuthSession,
} from '../services/jobs-api';

const SESSION_KEY = 'jobtracker.auth-session';

type AuthStore = {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  expireSession: () => Promise<void>;
};

const AuthContext = createContext<AuthStore | null>(null);

function getWebSessionStorage(): Storage | null {
  return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
}

async function readSession(): Promise<AuthSession | null> {
  const stored = Platform.OS === 'web'
    ? getWebSessionStorage()?.getItem(SESSION_KEY) ?? null
    : await SecureStore.getItemAsync(SESSION_KEY);
  if (!stored) return null;

  const value: unknown = JSON.parse(stored);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('token' in value) ||
    typeof value.token !== 'string' ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'string' ||
    !('user' in value) ||
    typeof value.user !== 'object' ||
    value.user === null ||
    !('id' in value.user) ||
    typeof value.user.id !== 'string' ||
    !('email' in value.user) ||
    typeof value.user.email !== 'string' ||
    !('createdAt' in value.user) ||
    typeof value.user.createdAt !== 'string'
  ) {
    throw new Error('Stored sign-in data is invalid. Please sign in again.');
  }
  return value as AuthSession;
}

async function writeSession(session: AuthSession): Promise<void> {
  const serialized = JSON.stringify(session);
  if (Platform.OS === 'web') {
    const storage = getWebSessionStorage();
    if (!storage) throw new Error('Secure browser session storage is unavailable.');
    storage.setItem(SESSION_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, serialized);
}

async function removeSession(): Promise<void> {
  if (Platform.OS === 'web') {
    getWebSessionStorage()?.removeItem(SESSION_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const stored = await readSession();
        if (!stored) return;
        if (Date.parse(stored.expiresAt) <= Date.now()) {
          await removeSession();
          return;
        }

        if (active) setSession(stored);
        try {
          const current = await getCurrentUser(stored.token);
          const refreshed = { ...stored, user: current.user };
          await writeSession(refreshed);
          if (active) setSession(refreshed);
        } catch (sessionError) {
          if (sessionError instanceof ApiError && sessionError.status === 401) {
            await removeSession();
            if (active) {
              setSession(null);
              setError('Your session expired. Please sign in again.');
            }
          } else if (active) {
            setError(errorMessage(sessionError));
          }
        }
      } catch (storageError) {
        await removeSession();
        if (active) setError(errorMessage(storageError));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const authenticate = useCallback(async (request: () => Promise<AuthSession>) => {
    setError(null);
    try {
      const nextSession = await request();
      await writeSession(nextSession);
      setSession(nextSession);
    } catch (authError) {
      setError(errorMessage(authError));
      throw authError;
    }
  }, []);

  const login = useCallback(
    (email: string, password: string) => authenticate(() => loginRequest(email, password)),
    [authenticate],
  );
  const register = useCallback(
    (email: string, password: string) => authenticate(() => registerRequest(email, password)),
    [authenticate],
  );

  const expireSession = useCallback(async () => {
    await removeSession();
    setSession(null);
    setError('Your session expired. Please sign in again.');
  }, []);

  const signOut = useCallback(async () => {
    const currentSession = session;
    setError(null);
    try {
      if (currentSession) await logoutRequest(currentSession.token);
    } catch (logoutError) {
      setError(errorMessage(logoutError));
    } finally {
      await removeSession();
      setSession(null);
    }
  }, [session]);

  const value = useMemo(
    () => ({ session, isLoading, error, clearError: () => setError(null), login, register, signOut, expireSession }),
    [session, isLoading, error, login, register, signOut, expireSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStore {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used within AuthProvider');
  return auth;
}
