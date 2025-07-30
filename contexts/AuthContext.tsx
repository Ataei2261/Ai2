
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { ActiveSession, AuthContextType } from '../types';
import { verifyPassword } from '../services/authService';
import { useLocalStorage } from '../hooks/useLocalStorage';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'auth-session-v2';
const LEGACY_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours (fallback)
const MAX_SETIMEOUT_DELAY = 2147483647; // Max 32-bit signed int for setTimeout, approx 24.8 days

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [storedSession, setStoredSession, storageError] = useLocalStorage<ActiveSession | null>(SESSION_KEY, null);
  const [activeSession, setActiveSession] = useState<ActiveSession>({ isAuthenticated: false });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (storageError) {
        console.error("[AuthContext] Error with localStorage for session:", storageError);
        setStoredSession(null); // Attempt to clear potentially corrupted storage entry
    }
    if (storedSession && storedSession.isAuthenticated) {
      const now = Date.now();
      let sessionIsValid = false;

      const hasActivationToken = !!storedSession.activationToken;
      const activationTokenStillValid = hasActivationToken && storedSession.activationTokenExpiresAt && storedSession.activationTokenExpiresAt > now;
      const overallKeyStillValid = storedSession.sessionExpiresAt && storedSession.sessionExpiresAt > now;
      const legacySessionStillValid = !hasActivationToken && !storedSession.sessionExpiresAt && storedSession.sessionStartedAt && (now - storedSession.sessionStartedAt < LEGACY_SESSION_DURATION_MS);

      if (activationTokenStillValid) {
        sessionIsValid = true;
      } else if (overallKeyStillValid) {
        if (hasActivationToken && storedSession.activationTokenExpiresAt && storedSession.activationTokenExpiresAt <= now) {
          sessionIsValid = false;
        } else if (!hasActivationToken) {
          sessionIsValid = true;
        } else {
          sessionIsValid = false;
        }
      } else if (legacySessionStillValid) {
        sessionIsValid = true;
      }


      if (sessionIsValid) {
        setActiveSession(storedSession);
      } else {
        console.warn("[AuthContext] Stored session is invalid or expired. Clearing session. Details for debugging:", {
            isAuthenticated: storedSession.isAuthenticated,
            userIdentifier: storedSession.userIdentifier,
            role: storedSession.role,
            hasActivationToken,
            activationToken: storedSession.activationToken,
            activationTokenExpiresAt: storedSession.activationTokenExpiresAt ? new Date(storedSession.activationTokenExpiresAt).toISOString() + ` (${storedSession.activationTokenExpiresAt})` : undefined,
            activationTokenStillValid,
            sessionExpiresAt: storedSession.sessionExpiresAt ? new Date(storedSession.sessionExpiresAt).toISOString() + ` (${storedSession.sessionExpiresAt})` : undefined,
            overallKeyStillValid,
            sessionStartedAt: storedSession.sessionStartedAt ? new Date(storedSession.sessionStartedAt).toISOString() + ` (${storedSession.sessionStartedAt})` : undefined,
            legacySessionStillValid,
            currentTime: new Date(now).toISOString() + ` (${now})`
        });
        setStoredSession(null);
        setActiveSession({ isAuthenticated: false });
      }
    } else {
        // No stored authenticated session or storage error handled above.
    }
    setIsLoading(false);
  }, [storedSession, setStoredSession, storageError]);

  const login = useCallback(async (password: string) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const response = await verifyPassword(password);
      if (response.success) {
        const now = Date.now();
        let tokenExpiryTimestamp: number | undefined = undefined;
        if (response.activationTokenExpiresAt) {
          tokenExpiryTimestamp = Date.parse(response.activationTokenExpiresAt);
          if (isNaN(tokenExpiryTimestamp)) {
            console.error("[AuthContext] Invalid activationTokenExpiresAt received from server:", response.activationTokenExpiresAt);
            setAuthError("خطای داخلی: تاریخ انقضای نامعتبر از سرور دریافت شد.");
            setIsLoading(false);
            return;
          }
        }

        const newSession: ActiveSession = {
          isAuthenticated: true,
          userIdentifier: response.user || password,
          activationToken: response.activationToken,
          activationTokenExpiresAt: tokenExpiryTimestamp,
          sessionStartedAt: now,
          sessionExpiresAt: response.expiresAt ? Date.parse(response.expiresAt) : undefined,
          role: response.role,
        };
        setActiveSession(newSession);
        setStoredSession(newSession);
        console.log("[AuthContext] Login successful, new session created:", newSession);
      } else {
        setAuthError(response.error || 'رمز عبور نامعتبر است یا فعال‌سازی امکان‌پذیر نیست.');
        setActiveSession({ isAuthenticated: false });
        setStoredSession(null);
      }
    } catch (error: any) {
      console.error("[AuthContext] Login error:", error);
      setAuthError(error.message || 'خطایی در هنگام ورود رخ داد.');
      setActiveSession({ isAuthenticated: false });
      setStoredSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [setStoredSession]);

  const logout = useCallback(() => {
    console.log("[AuthContext] Logging out. Clearing session.");
    setActiveSession({ isAuthenticated: false });
    setStoredSession(null);
  }, [setStoredSession]);

  useEffect(() => {
    if (activeSession.isAuthenticated) {
      const now = Date.now();
      let soonestValidExpiryMs: number | null = null;
      let expiryTypeForLog = "unknown";

      // Check activation token expiry first
      if (activeSession.activationToken && activeSession.activationTokenExpiresAt && activeSession.activationTokenExpiresAt > now) {
        soonestValidExpiryMs = activeSession.activationTokenExpiresAt;
        expiryTypeForLog = "activationToken";
      }

      // Then check overall key expiry (sessionExpiresAt)
      // This is relevant if activation token is expired or not present.
      if (activeSession.sessionExpiresAt && activeSession.sessionExpiresAt > now) {
        const activationTokenIsPresentAndValid = activeSession.activationToken && activeSession.activationTokenExpiresAt && activeSession.activationTokenExpiresAt > now;
        if (!activationTokenIsPresentAndValid) { // If activation token is not present or is expired
            if (soonestValidExpiryMs === null || activeSession.sessionExpiresAt < soonestValidExpiryMs) {
                soonestValidExpiryMs = activeSession.sessionExpiresAt;
                expiryTypeForLog = "overallKey (sessionExpiresAt)";
            }
        }
      }
      
      // Fallback to legacy client-side session if no server-provided expiries are valid
      if (soonestValidExpiryMs === null &&
          !activeSession.activationToken && // No activation token
          !activeSession.sessionExpiresAt && // No overall key expiry
          activeSession.sessionStartedAt) { // But there is a legacy session start time
          const legacyExpiry = activeSession.sessionStartedAt + LEGACY_SESSION_DURATION_MS;
          if (legacyExpiry > now) {
              soonestValidExpiryMs = legacyExpiry;
              expiryTypeForLog = "legacyClientSession";
          }
      }

      if (soonestValidExpiryMs !== null) {
        const timeRemaining = soonestValidExpiryMs - now;
        
        if (timeRemaining <= 0) {
          console.warn(`[AuthContext] Session determined to be already expired by ${expiryTypeForLog} in setTimeout setup (timeRemaining: ${timeRemaining}ms). Logging out.`);
          logout();
          return;
        }

        const effectiveDelay = Math.min(timeRemaining, MAX_SETIMEOUT_DELAY);
        
        const timerId = setTimeout(() => {
            const currentNow = Date.now();
            let isActuallyExpired = false;
            let actualExpiryType = "unknown";

            // Re-evaluate expiry conditions at the time the timer fires
            if (activeSession.activationToken && activeSession.activationTokenExpiresAt && activeSession.activationTokenExpiresAt <= currentNow) {
                isActuallyExpired = true;
                actualExpiryType = "activationToken";
            } else if (activeSession.sessionExpiresAt && (!activeSession.activationToken || (activeSession.activationTokenExpiresAt && activeSession.activationTokenExpiresAt <= currentNow)) && activeSession.sessionExpiresAt <= currentNow) {
                // This condition implies activation token is either not there, or it's expired, AND overall key is expired.
                isActuallyExpired = true;
                actualExpiryType = "overallKey (sessionExpiresAt)";
            } else if (!activeSession.activationToken && !activeSession.sessionExpiresAt && activeSession.sessionStartedAt && (currentNow - activeSession.sessionStartedAt >= LEGACY_SESSION_DURATION_MS)) {
                isActuallyExpired = true;
                actualExpiryType = "legacyClientSession";
            }


            if (isActuallyExpired) {
                console.log(`[AuthContext] Session timer expired due to ${actualExpiryType}. Logging out.`);
                logout();
            } else {
                 // This case can happen if MAX_SETIMEOUT_DELAY was used and the real expiry is further out.
                 // The useEffect will run again due to activeSession dependency if logout() wasn't called,
                 // and a new, shorter timer might be set.
            }
        }, effectiveDelay);

        return () => clearTimeout(timerId);
      } else {
        // If no valid future expiry is found (all known expiries are past or not present)
        console.log("[AuthContext] No valid future expiry found for the current session. Logging out to ensure security/correctness.");
        logout();
      }
    }
    // If activeSession.isAuthenticated is false, this effect does nothing with timers.
  }, [activeSession, logout]);

  const contextValue = useMemo(() => ({
    activeSession,
    login,
    logout,
    isLoading,
    authError,
  }), [activeSession, login, logout, isLoading, authError]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}; // End of AuthProvider component

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
// End of file marker - ensures no truncation in this representation.
