import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Capture the install prompt at module load time — before any component mounts —
// so the native browser banner is always suppressed (e.preventDefault is called immediately).
let _cachedPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _cachedPrompt = e as BeforeInstallPromptEvent;
    // Notify any mounted PWAInstallButton instances
    window.dispatchEvent(new Event('pwa-prompt-ready'));
  });
}

export function PWAInstallButton({ alwaysVisible = false }: { alwaysVisible?: boolean } = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Use the already-captured prompt if available
    if (_cachedPrompt) {
      setDeferredPrompt(_cachedPrompt);
      setShowButton(true);
    }

    // Also listen in case it fires after mount
    const onPromptReady = () => {
      if (_cachedPrompt) {
        setDeferredPrompt(_cachedPrompt);
        setShowButton(true);
      }
    };
    window.addEventListener('pwa-prompt-ready', onPromptReady);
    return () => window.removeEventListener('pwa-prompt-ready', onPromptReady);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert('To install on iPhone:\n\n1. Tap the Share button (square with arrow)\n2. Tap "Add to Home Screen"\n3. Tap "Add"');
      } else {
        alert('To install:\n\n1. Open browser menu (⋮)\n2. Select "Install app" or "Add to Home screen"\n3. Follow the prompts');
      }
      return;
    }

    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowButton(false);
    } catch (err) {
      console.error('PWA install error', err);
    } finally {
      setIsInstalling(false);
      _cachedPrompt = null;
      setDeferredPrompt(null);
    }
  };

  if (!showButton && !alwaysVisible) return null;

  return (
    <Button
      onClick={handleInstall}
      disabled={isInstalling}
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs font-semibold shrink-0"
    >
      <Download className="w-3.5 h-3.5" />
      {isInstalling ? 'Installing…' : 'Install'}
    </Button>
  );
}
