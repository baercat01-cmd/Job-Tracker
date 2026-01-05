// Offline manager - handles online/offline detection and sync coordination

import { useEffect, useState } from 'react';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

// Global connection status
let currentStatus: ConnectionStatus = navigator.onLine ? 'online' : 'offline';
const listeners = new Set<(status: ConnectionStatus) => void>();

// Initialize connection monitoring
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    updateStatus('online');
  });

  window.addEventListener('offline', () => {
    updateStatus('offline');
  });
}

function updateStatus(status: ConnectionStatus) {
  currentStatus = status;
  listeners.forEach((listener) => listener(status));
}

export function setStatus(status: ConnectionStatus) {
  updateStatus(status);
}

export function getStatus(): ConnectionStatus {
  return currentStatus;
}

export function subscribe(listener: (status: ConnectionStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// React hook for connection status
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(currentStatus);

  useEffect(() => {
    const unsubscribe = subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

// Check if device is online
export function isOnline(): boolean {
  return navigator.onLine;
}

// Wait for online connection
export async function waitForOnline(): Promise<void> {
  if (navigator.onLine) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handler = () => {
      window.removeEventListener('online', handler);
      resolve();
    };
    window.addEventListener('online', handler);
  });
}

// Test network connectivity (ping)
export async function testConnection(): Promise<boolean> {
  if (!navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch('/manifest.json', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.ok;
  } catch {
    return false;
  }
}
