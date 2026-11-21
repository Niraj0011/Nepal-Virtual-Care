
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { getCurrentUser, logoutPatient } from '../api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Restore the previously cached user.
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nvc-user') || 'null');
    } catch {
      return null;
    }
  });

  // Check for either an access token or a refresh token.
  const [authLoading, setAuthLoading] = useState(
    () => Boolean(
      localStorage.getItem('nvc-access') ||
      localStorage.getItem('nvc-refresh')
    )
  );

  // Restore locally cached appointments.
  const [appointments, setAppointments] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('nvc-appointments') || '[]'
      );

      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Clear account state when authentication expires.
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      setAuthLoading(false);
      setAppointments([]);
    };

    window.addEventListener('nvc:auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener(
        'nvc:auth-expired',
        handleAuthExpired
      );
    };
  }, []);

  // Verify the saved session with Django on app startup.
  useEffect(() => {
    let active = true;

    const verifyUser = async () => {
      const access = localStorage.getItem('nvc-access');
      const refresh = localStorage.getItem('nvc-refresh');

      if (!access && !refresh) {
        if (active) {
          setUser(null);
          setAuthLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getCurrentUser();

        if (active) {
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Unable to verify user session:', error);

        if (active) {
          const accessStillExists = Boolean(
            localStorage.getItem('nvc-access')
          );

          const refreshStillExists = Boolean(
            localStorage.getItem('nvc-refresh')
          );

          // If authentication was cleared, remove the cached user.
          // If tokens remain, preserve the cached user during a
          // temporary connection or server error.
          if (!accessStillExists && !refreshStillExists) {
            setUser(null);
          }
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    verifyUser();

    return () => {
      active = false;
    };
  }, []);

  // Keep the cached user synchronized.
  useEffect(() => {
    if (user) {
      localStorage.setItem('nvc-user', JSON.stringify(user));
    } else {
      localStorage.removeItem('nvc-user');
    }
  }, [user]);

  // Keep locally cached appointments synchronized.
  useEffect(() => {
    localStorage.setItem(
      'nvc-appointments',
      JSON.stringify(appointments)
    );
  }, [appointments]);

  // Log out and clear local account data.
  const logout = async () => {
    try {
      await logoutPatient();
    } finally {
      setUser(null);
      setAuthLoading(false);
      setAppointments([]);
    }
  };

  // Add a new appointment to local state.
  const book = (appointment) => {
    setAppointments((oldAppointments) => [
      {
        ...appointment,
        id: Date.now(),
        status: 'Pending',
      },
      ...oldAppointments,
    ]);
  };

  const value = {
    user,
    setUser,
    authLoading,
    appointments,
    setAppointments,
    book,
    logout,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

// Custom context hook.
export const useApp = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }

  return context;
};
