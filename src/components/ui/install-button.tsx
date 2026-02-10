import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export function InstallButton() {
  const [isInstallable, setIsInstallable] = useState(true);

  useEffect(() => {
    // Check if app is already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    setIsInstallable(!isStandalone);
  }, []);

  const handleInstall = () => {
    // Use the global function exposed from index.html
    if ((window as any).triggerPWAInstall) {
      (window as any).triggerPWAInstall();
    } else {
      // Fallback
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        alert("iOS: Tap 'Share' then 'Add to Home Screen'");
      } else {
        alert("Please use Chrome Menu (⋮) > Install App");
      }
    }
  };

  if (!isInstallable) {
    return null; // App is already installed
  }

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-2 px-6 py-3 bg-[#4179bc] text-white rounded-lg font-bold text-sm shadow-lg hover:bg-[#3a6ba8] active:scale-95 transition-all"
    >
      <Download className="w-5 h-5" />
      Install App on Device
    </button>
  );
}
