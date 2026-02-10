import { useState, useEffect } from 'react';
import { Download, X, Smartphone, Chrome, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function InstallButton() {
  const [isInstallable, setIsInstallable] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('android');

  useEffect(() => {
    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    setIsInstallable(!isStandalone);

    // Detect platform
    const userAgent = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      setPlatform('ios');
    } else if (/Android/.test(userAgent)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }
  }, []);

  const handleInstall = () => {
    // Use the global function exposed from index.html
    if ((window as any).triggerPWAInstall) {
      (window as any).triggerPWAInstall();
    } else {
      // Show detailed instructions instead of alert
      setShowInstructions(true);
    }
  };

  if (!isInstallable) {
    return null; // App is already installed
  }

  return (
    <>
      <button
        onClick={handleInstall}
        className="flex items-center gap-2 px-6 py-3 bg-[#4179bc] text-white rounded-lg font-bold text-sm shadow-lg hover:bg-[#3a6ba8] active:scale-95 transition-all"
      >
        <Download className="w-5 h-5" />
        Install App on Device
      </button>

      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              How to Install
            </DialogTitle>
            <DialogDescription>
              Follow these steps to install Martin Builder OS on your device
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {platform === 'ios' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Share2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-blue-900 mb-1">iOS Installation:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800">
                      <li>Tap the <strong>Share</strong> button (square with arrow) at the bottom</li>
                      <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                      <li>Tap <strong>"Add"</strong> in the top right</li>
                      <li>The app icon will appear on your home screen!</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {platform === 'android' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <Chrome className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-green-900 mb-1">Android Installation:</p>
                    <ol className="list-decimal list-inside space-y-1 text-green-800">
                      <li>Tap the <strong>3-dot menu (⋮)</strong> in the top right of Chrome</li>
                      <li>Look for <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></li>
                      <li>Tap it and confirm</li>
                      <li>The app will install to your device!</li>
                    </ol>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  You can also look for the install icon in the address bar
                </p>
              </div>
            )}

            {platform === 'desktop' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <Chrome className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-purple-900 mb-1">Desktop Installation:</p>
                    <ol className="list-decimal list-inside space-y-1 text-purple-800">
                      <li>Look for the <strong>install icon</strong> in the Chrome address bar</li>
                      <li>Or click the <strong>3-dot menu (⋮)</strong> → <strong>"Install Martin Builder OS"</strong></li>
                      <li>Click <strong>"Install"</strong> in the popup</li>
                      <li>The app will open in its own window!</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                <strong>Note:</strong> Your browser may need a moment to validate the app before the install option appears.
              </p>
            </div>

            <Button
              onClick={() => setShowInstructions(false)}
              className="w-full"
            >
              Got it!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
