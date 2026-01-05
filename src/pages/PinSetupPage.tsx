import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Fingerprint, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { hashPin, registerBiometric, isWebAuthnSupported } from '@/lib/auth';
import type { UserProfile } from '@/types';

interface PinSetupPageProps {
  user: UserProfile;
  onComplete: () => void;
  onBack: () => void;
}

export function PinSetupPage({ user, onComplete, onBack }: PinSetupPageProps) {
  const [step, setStep] = useState<'pin' | 'confirm' | 'biometric'>('pin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinHash, setPinHash] = useState('');

  const supportsBiometric = isWebAuthnSupported();

  async function handleSetPin() {
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }

    setStep('confirm');
  }

  async function handleConfirmPin() {
    if (pin !== confirmPin) {
      toast.error('PINs do not match');
      setConfirmPin('');
      return;
    }

    setLoading(true);

    try {
      // Hash the PIN
      const hash = await hashPin(pin);
      setPinHash(hash);

      // Save PIN to database
      const { error } = await supabase
        .from('user_profiles')
        .update({ pin_hash: hash })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('PIN set successfully');

      // Mark user as authenticated
      localStorage.setItem('fieldtrack_authenticated', 'true');

      // Move to biometric setup if supported
      if (supportsBiometric) {
        setStep('biometric');
      } else {
        onComplete();
      }
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      toast.error('Failed to set PIN');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupBiometric() {
    setLoading(true);

    try {
      // Register biometric credential
      const credential = await registerBiometric(user.id, user.username || 'User');

      // Save credential to database
      const { error } = await supabase
        .from('user_profiles')
        .update({
          webauthn_credentials: [credential],
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Biometric authentication enabled');
      
      // Mark user as authenticated
      localStorage.setItem('fieldtrack_authenticated', 'true');
      
      onComplete();
    } catch (error: any) {
      console.error('Error setting up biometric:', error);
      toast.error(error.message || 'Failed to setup biometric authentication');
    } finally {
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
            <CardTitle className="text-2xl font-bold">Welcome, {user.username}!</CardTitle>
            <CardDescription>
              {step === 'pin' && 'Create a 4-digit PIN to secure your account'}
              {step === 'confirm' && 'Confirm your PIN'}
              {step === 'biometric' && 'Enable biometric login (optional)'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PIN Setup */}
          {step === 'pin' && (
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your PIN will be required each time you log in. Make sure it's memorable but secure.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="pin">Enter 4-digit PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="text-center text-2xl tracking-widest h-14"
                  autoFocus
                />
              </div>

              <Button
                onClick={handleSetPin}
                disabled={pin.length !== 4 || loading}
                className="w-full h-12 gradient-primary"
              >
                Continue
              </Button>
            </div>
          )}

          {/* PIN Confirmation */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pin">Confirm your PIN</Label>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="text-center text-2xl tracking-widest h-14"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('pin');
                    setPin('');
                    setConfirmPin('');
                  }}
                  className="flex-1"
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmPin}
                  disabled={confirmPin.length !== 4 || loading}
                  className="flex-1 gradient-primary"
                >
                  {loading ? 'Saving...' : 'Confirm'}
                </Button>
              </div>
            </div>
          )}

          {/* Biometric Setup */}
          {step === 'biometric' && (
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Fingerprint className="w-8 h-8 text-primary" />
                </div>
              </div>

              <Alert>
                <Fingerprint className="h-4 w-4" />
                <AlertDescription>
                  Use your fingerprint, Face ID, or other biometric authentication for faster login.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button
                  onClick={handleSetupBiometric}
                  disabled={loading}
                  className="w-full h-12 gradient-primary"
                >
                  <Fingerprint className="w-5 h-5 mr-2" />
                  {loading ? 'Setting up...' : 'Enable Biometric Login'}
                </Button>

                <Button
                  variant="outline"
                  onClick={onComplete}
                  disabled={loading}
                  className="w-full h-12"
                >
                  Skip for Now
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                You can enable this later in settings
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
