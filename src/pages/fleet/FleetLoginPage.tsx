import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Truck, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export function FleetLoginPage() {
  const navigate = useNavigate();
  const { setUser } = useFleetAuth();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter both username and password');
      return;
    }

    setLoading(true);

    try {
      // Call database function to verify password
      const { data, error } = await supabase.rpc('verify_user_password', {
        p_username: username,
        p_password: password,
      });

      if (error) throw error;

      if (!data) {
        toast.error('Invalid username or password');
        return;
      }

      // Login successful - set user in store
      setUser({
        id: data,
        username: username,
      });

      toast.success('Login successful');
      navigate('/fleet');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-slate-700 shadow-2xl">
        <CardHeader className="text-center bg-gradient-to-r from-slate-800 to-slate-700 border-b-2 border-slate-600">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-slate-900 rounded-full border-2 border-yellow-500">
              <Truck className="w-12 h-12 text-yellow-500" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            Fleet Management System
          </CardTitle>
          <p className="text-sm text-slate-300 mt-2">Sign in to manage your fleet</p>
        </CardHeader>
        <CardContent className="pt-6 bg-slate-50">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <User className="w-4 h-4" />
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 border-2 border-slate-300 focus:border-yellow-500"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-2 border-slate-300 focus:border-yellow-500"
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-black font-bold text-base shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <div className="text-xs text-center text-slate-500 pt-2">
              Default credentials: admin / admin123
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
