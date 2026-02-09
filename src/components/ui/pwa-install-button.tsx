import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setShowButton(false);
      return;
    }

    // Listen for the install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowButton(true);
      console.log('PWA: Install prompt available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if we missed the event (it fired before component mounted)
    // In that case, show a manual install guide
    setTimeout(() => {
      if (!deferredPrompt && !isStandalone) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIOS) {
          setShowButton(true); // Show for iOS users with manual instructions
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // For iOS or if prompt not available, show manual instructions
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert('To install on iPhone:\n\n1. Tap the Share button (square with arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" in the top right');
      } else {
        alert('To install:\n\n1. Open the browser menu (⋮)\n2. Select "Install app" or "Add to Home screen"\n3. Follow the prompts');
      }
      return;
    }

    setIsInstalling(true);
    
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('PWA: User accepted installation');
        setShowButton(false);
      } else {
        console.log('PWA: User dismissed installation');
      }
    } catch (error) {
      console.error('PWA: Installation error', error);
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowButton(false);
    // Store dismissal in localStorage to not show again this session
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Check if user dismissed it this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      setShowButton(false);
    }
  }, []);

  if (!showButton) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-[#4179bc] text-white rounded-xl shadow-2xl p-4 max-w-sm relative">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-white/60 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="pr-6">
          <div className="flex items-center gap-3 mb-2">
            <Download className="h-6 w-6" />
            <h3 className="font-bold text-sm">Install Martin Builder OS</h3>
          </div>
          
          <p className="text-xs text-white/80 mb-3">
            Install the app for offline access, faster loading, and a better mobile experience.
          </p>
          
          <button
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="w-full bg-white text-[#4179bc] py-2.5 px-4 rounded-lg font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50"
          >
            {isInstalling ? 'Installing...' : 'Install Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
