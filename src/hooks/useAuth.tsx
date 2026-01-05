import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types';

type AuthState = 'authenticated' | 'needs_pin_setup' | 'needs_login' | 'unauthenticated';

interface AuthContextType {
  profile: UserProfile | null;
  loading: boolean;
  authState: AuthState;
  selectUser: (user: UserProfile) => void;
  clearUser: () => void;
}

// Initialize with default value to prevent undefined context errors
const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  authState: 'unauthenticated',
  selectUser: () => {},
  clearUser: () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('unauthenticated');

  useEffect(() => {
    // Try to restore authenticated user from localStorage
    const storedUserId = localStorage.getItem('fieldtrack_user_id');
    const isAuthenticated = localStorage.getItem('fieldtrack_authenticated') === 'true';
    
    if (storedUserId) {
      loadUser(storedUserId, isAuthenticated);
    } else {
      setLoading(false);
    }
  }, []);

  async function loadUser(userId: string, isAuthenticated: boolean) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      if (!data.role || (data.role !== 'crew' && data.role !== 'foreman' && data.role !== 'office' && data.role !== 'payroll')) {
        throw new Error('Invalid user role');
      }
      
      setProfile(data);
      
      // Determine auth state based on PIN setup and authentication status
      if (!data.pin_hash) {
        // No PIN set - needs setup
        setAuthState('needs_pin_setup');
      } else if (!isAuthenticated) {
        // PIN set but not authenticated - needs login
        setAuthState('needs_login');
      } else {
        // Authenticated
        setAuthState('authenticated');
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading user:', error);
      }
      localStorage.removeItem('fieldtrack_user_id');
      localStorage.removeItem('fieldtrack_authenticated');
      setProfile(null);
      setAuthState('unauthenticated');
    } finally {
      setLoading(false);
    }
  }

  function selectUser(user: UserProfile) {
    localStorage.setItem('fieldtrack_user_id', user.id);
    localStorage.removeItem('fieldtrack_authenticated'); // Require authentication
    setProfile(user);
    
    // Determine auth state
    if (!user.pin_hash) {
      setAuthState('needs_pin_setup');
    } else {
      setAuthState('needs_login');
    }
  }

  function clearUser() {
    localStorage.removeItem('fieldtrack_user_id');
    localStorage.removeItem('fieldtrack_authenticated');
    // Clear user-specific data
    const userId = profile?.id;
    if (userId) {
      localStorage.removeItem(`fieldtrack_timers_${userId}`);
      localStorage.removeItem('fieldtrack_daily_log_draft');
      localStorage.removeItem('fieldtrack_photo_queue');
    }
    setProfile(null);
    setAuthState('unauthenticated');
  }

  return (
    <AuthContext.Provider value={{ profile, loading, authState, selectUser, clearUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  // Context should always exist now with default value
  return context;
}
