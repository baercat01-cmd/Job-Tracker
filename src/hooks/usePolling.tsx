import { useEffect, useRef, useState } from 'react';

interface UsePollingOptions {
  interval?: number; // milliseconds
  enabled?: boolean;
  onError?: (error: any) => void;
}

/**
 * Custom hook for polling data at regular intervals
 * Used as alternative to real-time subscriptions since OnSpace Cloud doesn't support Realtime
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions = {}
) {
  const {
    interval = 5000, // Default 5 seconds
    enabled = true,
    onError,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const fetchData = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      const result = await fetchFn();
      
      if (isMountedRef.current) {
        setData(result);
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Polling error:', err);
      if (isMountedRef.current) {
        setError(err);
        if (onError) {
          onError(err);
        }
      }
    } finally {
      if (isMountedRef.current && showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchData(true);

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      fetchData(false); // Don't show loading indicator for background updates
    }, interval);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval]);

  // Manual refresh function
  const refresh = () => {
    fetchData(false);
  };

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

/**
 * Hook specifically for polling with visibility detection
 * Pauses polling when tab is not visible to save resources
 */
export function useVisibilityPolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions = {}
) {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return usePolling(fetchFn, {
    ...options,
    enabled: options.enabled !== false && isVisible,
  });
}
