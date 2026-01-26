import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FleetUser {
  id: string;
  username: string;
}

interface FleetAuthState {
  user: FleetUser | null;
  setUser: (user: FleetUser | null) => void;
  logout: () => void;
}

export const useFleetAuth = create<FleetAuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'fleet-auth-storage',
    }
  )
);
