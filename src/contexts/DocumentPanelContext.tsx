import { createContext, useContext } from 'react';

export interface DocumentPanelContextValue {
  /** When true, the materials panel shows the document viewer (embed) instead of the workbook */
  showDocumentsInPanel: boolean;
  setShowDocumentsInPanel: (show: boolean) => void;
}

export const DocumentPanelContext = createContext<DocumentPanelContextValue | null>(null);

export function useDocumentPanel() {
  return useContext(DocumentPanelContext);
}
