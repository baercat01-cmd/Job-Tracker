import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Lock, Fingerprint, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { verifyPin, authenticateBiometric, isWebAuthnSupported } from '@/lib/auth';
import type { UserProfile } from '@/types';

interface LoginPageProps {
  user: UserProfile;
  onSuccess: () => void;
  onBack: () => void;
}

export function LoginPage({ user, onSuccess, onBack }: LoginPageProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const hasBiometric = user.webauthn_credentials && 
    Array.isArray(user.webauthn_credentials) && 
    user.webauthn_credentials.length > 0;
  const supportsBiometric = isWebAuthnSupported();

  async function handlePinLogin() {
    if (pin.length !== 4) {
      toast.error('Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);

    try {
      // Verify PIN
      const isValid = await verifyPin(pin, user.pin_hash!);
      
      if (!isValid) {
        toast.error('Incorrect PIN');
        setPin('');
        setLoading(false);
        return;
      }

      toast.success('Welcome back!');
      
      // Mark user as authenticated
      localStorage.setItem('fieldtrack_authenticated', 'true');
      
      onSuccess();
    } catch (error: any) {
      console.error('PIN login error:', error);
      toast.error('Login failed');
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setLoading(true);

    try {
      const isAuthenticated = await authenticateBiometric(
        user.id,
        user.webauthn_credentials as any[]
      );

      if (!isAuthenticated) {
        toast.error('Biometric authentication failed');
        setLoading(false);
        return;
      }

      toast.success('Welcome back!');
      
      // Mark user as authenticated
      localStorage.setItem('fieldtrack_authenticated', 'true');
      
      onSuccess();
    } catch (error: any) {
      console.error('Biometric login error:', error);
      toast.error(error.message || 'Biometric authentication failed');
      setLoading(false);
    }
  }



  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={loading}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex-1 flex justify-center">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-16 w-auto"
              />
            </div>
            <div className="w-20" /> {/* Spacer for alignment */}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
            <CardDescription>{user.username}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-8 h-8 text-primary" />
              </div>
            </div>

            {/* Biometric Login Button */}
            {hasBiometric && supportsBiometric && (
              <Button
                onClick={handleBiometricLogin}
                disabled={loading}
                variant="outline"
                className="w-full h-14 border-2 border-primary hover:bg-primary/10"
              >
                <Fingerprint className="w-6 h-6 mr-3 text-primary" />
                <span className="text-base font-semibold">Use Biometric</span>
              </Button>
            )}

            {/* PIN Input */}
            <div className="space-y-2">
              <Label htmlFor="pin">Enter your PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pin.length === 4) {
                    handlePinLogin();
                  }
                }}
                placeholder="••••"
                className="text-center text-2xl tracking-widest h-14"
                autoFocus
                disabled={loading}
              />
            </div>

            <Button
              onClick={handlePinLogin}
              disabled={pin.length !== 4 || loading}
              className="w-full h-12 gradient-primary"
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
