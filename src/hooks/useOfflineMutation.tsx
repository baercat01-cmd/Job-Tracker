// React hook for offline mutations with optimistic UI updates

import { useState } from 'react';
import { toast } from 'sonner';
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  createDailyLog,
  updateDailyLog,
  createPhoto,
  deletePhoto,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  createJob,
  updateJob,
  createComponent,
  updateComponent,
  createWorker,
  updateWorker,
} from '@/lib/offline-mutations';

export function useOfflineMutation() {
  const [isLoading, setIsLoading] = useState(false);

  const mutate = async <T,>(
    operation: () => Promise<{ data: T | null; error: any }>,
    options?: {
      onSuccess?: (data: T) => void;
      onError?: (error: any) => void;
      successMessage?: string;
      errorMessage?: string;
    }
  ): Promise<{ data: T | null; error: any }> => {
    setIsLoading(true);

    try {
      const result = await operation();

      if (result.error) {
        const message = options?.errorMessage || 'Operation failed';
        toast.error(message);
        options?.onError?.(result.error);
      } else if (result.data) {
        if (options?.successMessage) {
          toast.success(options.successMessage);
        }
        options?.onSuccess?.(result.data);
      }

      return result;
    } catch (error) {
      const message = options?.errorMessage || 'Operation failed';
      toast.error(message);
      options?.onError?.(error);
      return { data: null, error };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    
    // Time entry mutations
    createTimeEntry: (data: any, options?: any) =>
      mutate(() => createTimeEntry(data), options),
    updateTimeEntry: (id: string, updates: any, options?: any) =>
      mutate(() => updateTimeEntry(id, updates), options),
    deleteTimeEntry: (id: string, options?: any) =>
      mutate(() => deleteTimeEntry(id).then(() => ({ data: true, error: null })), options),

    // Daily log mutations
    createDailyLog: (data: any, options?: any) =>
      mutate(() => createDailyLog(data), options),
    updateDailyLog: (id: string, updates: any, options?: any) =>
      mutate(() => updateDailyLog(id, updates), options),

    // Photo mutations
    createPhoto: (data: any, options?: any) =>
      mutate(() => createPhoto(data), options),
    deletePhoto: (id: string, options?: any) =>
      mutate(() => deletePhoto(id).then(() => ({ data: true, error: null })), options),

    // Material mutations
    createMaterial: (data: any, options?: any) =>
      mutate(() => createMaterial(data), options),
    updateMaterial: (id: string, updates: any, options?: any) =>
      mutate(() => updateMaterial(id, updates), options),
    deleteMaterial: (id: string, options?: any) =>
      mutate(() => deleteMaterial(id).then(() => ({ data: true, error: null })), options),

    // Job mutations
    createJob: (data: any, options?: any) =>
      mutate(() => createJob(data), options),
    updateJob: (id: string, updates: any, options?: any) =>
      mutate(() => updateJob(id, updates), options),

    // Component mutations
    createComponent: (data: any, options?: any) =>
      mutate(() => createComponent(data), options),
    updateComponent: (id: string, updates: any, options?: any) =>
      mutate(() => updateComponent(id, updates), options),

    // Worker mutations
    createWorker: (data: any, options?: any) =>
      mutate(() => createWorker(data), options),
    updateWorker: (id: string, updates: any, options?: any) =>
      mutate(() => updateWorker(id, updates), options),
  };
}
