import React, { createContext, useContext, useState, useCallback } from 'react';

export type FlashType = 'success' | 'error' | 'info';

export interface FlashMessage {
  type: FlashType;
  message: string;
}

interface FlashContextType {
  flash: FlashMessage | null;
  setFlash: (flash: FlashMessage | null) => void;
  clearFlash: () => void;
}

const FlashContext = createContext<FlashContextType | undefined>(undefined);

export const FlashProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flash, setFlashState] = useState<FlashMessage | null>(null);

  const setFlash = useCallback((msg: FlashMessage | null) => {
    setFlashState(msg);
  }, []);

  const clearFlash = useCallback(() => {
    setFlashState(null);
  }, []);

  return (
    <FlashContext.Provider value={{ flash, setFlash, clearFlash }}>
      {children}
    </FlashContext.Provider>
  );
};

export function useFlash(): FlashContextType {
  const ctx = useContext(FlashContext);
  if (!ctx) {
    throw new Error('useFlash must be used within a FlashProvider');
  }
  return ctx;
}
