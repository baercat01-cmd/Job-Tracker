'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_UNDO_STACK = 50;

export interface UndoEntry {
  id: string;
  label: string;
  undo: () => void | Promise<void>;
}

interface UndoContextValue {
  push: (entry: Omit<UndoEntry, 'id'>) => void;
  undo: () => Promise<void>;
  canUndo: boolean;
  lastLabel: string | null;
  stackLength: number;
}

const UndoContext = createContext<UndoContextValue | null>(null);

let idCounter = 0;
function nextId() {
  return `undo-${Date.now()}-${++idCounter}`;
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<UndoEntry[]>([]);

  const push = useCallback((entry: Omit<UndoEntry, 'id'>) => {
    setStack((prev) => {
      const next = [...prev, { ...entry, id: nextId() }];
      return next.slice(-MAX_UNDO_STACK);
    });
  }, []);

  const performUndo = useCallback(async () => {
    const entry = stack[stack.length - 1];
    if (!entry) return;
    setStack((prev) => prev.slice(0, -1));
    try {
      await Promise.resolve(entry.undo());
      toast.success(`Undone: ${entry.label}`);
    } catch (e) {
      console.error('Undo failed:', e);
      toast.error(`Could not undo: ${entry.label}`);
    }
  }, [stack]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) return;
        const entry = stack[stack.length - 1];
        if (entry) {
          e.preventDefault();
          performUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stack, performUndo]);

  const value = useMemo<UndoContextValue>(
    () => ({
      push,
      undo: performUndo,
      canUndo: stack.length > 0,
      lastLabel: stack.length > 0 ? stack[stack.length - 1].label : null,
      stackLength: stack.length,
    }),
    [push, performUndo, stack]
  );

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    return {
      push: () => {},
      undo: async () => {},
      canUndo: false,
      lastLabel: null,
      stackLength: 0,
    };
  }
  return ctx;
}

/** Global Undo button at the top of the screen. Always visible; disabled when there is nothing to undo. */
export function UndoFloatingButton() {
  const { canUndo, lastLabel, undo } = useUndo();
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999]">
      <Button
        size="sm"
        variant="secondary"
        disabled={!canUndo}
        className="shadow-lg border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium h-9 px-4 rounded-md disabled:opacity-50 disabled:pointer-events-none"
        onClick={() => undo()}
        title={canUndo && lastLabel ? `Undo: ${lastLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
      >
        <Undo2 className="w-4 h-4 mr-2 shrink-0" />
        <span>{canUndo && lastLabel ? `Undo: ${lastLabel.length > 24 ? lastLabel.slice(0, 24) + '…' : lastLabel}` : 'Undo'}</span>
      </Button>
    </div>
  );
}
