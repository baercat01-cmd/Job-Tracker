import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Check if user has dismissed before
      const dismissed = localStorage.getItem('pwa_install_dismissed');
      if (!dismissed) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] App is already installed');
      setShowPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`[PWA] User response: ${outcome}`);
    
    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_install_dismissed', 'true');
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-96">
      <Card className="shadow-2xl border-2 border-green-500 bg-gradient-to-br from-green-50 to-white">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-sm">Install FieldTrack Pro</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Install this app on your device for:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-1">
                <li>✓ Faster access & better performance</li>
                <li>✓ Offline time tracking & daily logs</li>
                <li>✓ Works like a native app</li>
                <li>✓ No app store needed</li>
              </ul>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleInstallClick}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                  size="sm"
                >
                  Install App
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                >
                  Not Now
                </Button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
