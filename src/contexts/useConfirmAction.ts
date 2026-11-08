import { useContext } from 'react';
import { ConfirmActionContext, ConfirmAction } from './ConfirmActionValue';

export const useConfirmAction = (): ConfirmAction => {
  const confirmAction = useContext(ConfirmActionContext);
  if (!confirmAction) throw new Error('useConfirmAction must be used within ConfirmActionProvider');
  return confirmAction;
};
