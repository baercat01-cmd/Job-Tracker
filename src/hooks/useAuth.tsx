import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types';

interface AuthContextType {
  profile: UserProfile | null;
  loading: boolean;
  selectUser: (user: UserProfile) => void;
  clearUser: () => void;
}

// Initialize with default value to prevent undefined context errors
const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  selectUser: () => {},
  clearUser: () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to restore user from localStorage
    const storedUserId = localStorage.getItem('fieldtrack_user_id');
    
    if (storedUserId) {
      loadUser(storedUserId);
    } else {
      setLoading(false);
    }
  }, []);

  async function loadUser(userId: string) {
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
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading user:', error);
      }
      localStorage.removeItem('fieldtrack_user_id');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  function selectUser(user: UserProfile) {
    localStorage.setItem('fieldtrack_user_id', user.id);
    setProfile(user);
  }

  function clearUser() {
    localStorage.removeItem('fieldtrack_user_id');
    // Clear user-specific data
    const userId = profile?.id;
    if (userId) {
      localStorage.removeItem(`fieldtrack_timers_${userId}`);
      localStorage.removeItem('fieldtrack_daily_log_draft');
      localStorage.removeItem('fieldtrack_photo_queue');
    }
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ profile, loading, selectUser, clearUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  // Context should always exist now with default value
  return context;
}
