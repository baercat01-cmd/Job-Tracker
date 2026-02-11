import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AutoRefreshIndicatorProps {
  lastUpdated: Date | null;
  isRefreshing?: boolean;
}

export function AutoRefreshIndicator({ lastUpdated, isRefreshing = false }: AutoRefreshIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    if (!lastUpdated) {
      setTimeAgo('');
      return;
    }

    const updateTimeAgo = () => {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      
      if (seconds < 5) {
        setTimeAgo('Just now');
      } else if (seconds < 60) {
        setTimeAgo(`${seconds}s ago`);
      } else {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`${minutes}m ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  if (!lastUpdated) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
      <span>Updated {timeAgo}</span>
    </div>
  );
}
