import { createContext } from 'react';

export type ConfirmAction = (message: string, confirmLabel?: string) => Promise<boolean>;
export const ConfirmActionContext = createContext<ConfirmAction | null>(null);
