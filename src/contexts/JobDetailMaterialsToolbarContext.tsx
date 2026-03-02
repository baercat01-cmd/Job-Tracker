import { createContext, useContext } from 'react';

export interface MaterialsToolbarSlotValue {
  ref: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
}

export const JobDetailMaterialsToolbarSlotContext = createContext<MaterialsToolbarSlotValue | null>(null);

export function useMaterialsToolbarSlot() {
  return useContext(JobDetailMaterialsToolbarSlotContext);
}
