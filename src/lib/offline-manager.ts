// Offline manager - handles online/offline detection and sync coordination

import { useEffect, useState } from 'react';
import { getPendingSyncCount } from './offline-db';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

// Global connection status
let currentStatus: ConnectionStatus = navigator.onLine ? 'online' : 'offline';
const listeners = new Set<(status: ConnectionStatus) => void>();

// Pending changes tracking
let pendingChangesCount = 0;
const pendingChangesListeners = new Set<(count: number) => void>();

// Connection verification tracking
let lastConnectionCheck = Date.now();
let isCheckingConnection = false;

// Verify connection with actual network request
async function verifyConnection(): Promise<boolean> {
  if (isCheckingConnection) return navigator.onLine;
  
  // Rate limit checks to once per 5 seconds
  if (Date.now() - lastConnectionCheck < 5000) {
    return navigator.onLine;
  }

  isCheckingConnection = true;
  lastConnectionCheck = Date.now();

  try {
    // Try to fetch a small resource with short timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('/manifest.json', {
      method: 'HEAD',
      cache: 'no-cache',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    console.warn('[OfflineManager] Connection verification failed:', error);
    return false;
  } finally {
    isCheckingConnection = false;
  }
}

// Initialize connection monitoring
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    console.log('[OfflineManager] 🌐 Browser reports online');
    // Verify connection with actual network request
    const actuallyOnline = await verifyConnection();
    if (actuallyOnline) {
      console.log('[OfflineManager] ✓ Connection verified');
      updateStatus('online');
    } else {
      console.log('[OfflineManager] ⚠️ Verification failed, staying offline');
    }
  });

  window.addEventListener('offline', () => {
    console.log('[OfflineManager] ⚠️ Connection lost');
    updateStatus('offline');
  });

  // Periodic connection verification (every 30 seconds when online)
  setInterval(async () => {
    if (navigator.onLine && currentStatus === 'online') {
      const actuallyOnline = await verifyConnection();
      if (!actuallyOnline) {
        console.log('[OfflineManager] ⚠️ Lost connection (verified)');
        updateStatus('offline');
      }
    }
  }, 30000);
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

  return await verifyConnection();
}

// Force connection check
export async function checkConnection(): Promise<boolean> {
  const online = await verifyConnection();
  if (online !== (currentStatus === 'online' || currentStatus === 'syncing')) {
    updateStatus(online ? 'online' : 'offline');
  }
  return online;
}

// Pending changes management
export async function updatePendingChangesCount(): Promise<number> {
  try {
    const count = await getPendingSyncCount();
    pendingChangesCount = count;
    pendingChangesListeners.forEach((listener) => listener(count));
    return count;
  } catch (error) {
    console.error('[OfflineManager] Failed to get pending changes count:', error);
    return pendingChangesCount;
  }
}

export function getPendingChangesCount(): number {
  return pendingChangesCount;
}

export function subscribeToPendingChanges(listener: (count: number) => void): () => void {
  pendingChangesListeners.add(listener);
  // Immediately call with current count
  listener(pendingChangesCount);
  return () => pendingChangesListeners.delete(listener);
}

// React hook for pending changes count
export function usePendingChangesCount(): number {
  const [count, setCount] = useState<number>(pendingChangesCount);

  useEffect(() => {
    const unsubscribe = subscribeToPendingChanges(setCount);
    // Update count on mount
    updatePendingChangesCount();
    return unsubscribe;
  }, []);

  return count;
}

// Initialize pending changes tracking
if (typeof window !== 'undefined') {
  // Update pending changes count periodically (every 30 seconds)
  setInterval(() => {
    updatePendingChangesCount();
  }, 30000);

  // Initial count
  updatePendingChangesCount();
}
