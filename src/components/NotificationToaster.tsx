// Wrapper around sonner's Toaster that applies user preferences from the notification store.
// Using a wrapper allows position/theme/offset changes to take effect immediately without reload.

import React from 'react';
import { Toaster } from 'sonner';
import { useNotificationStore } from '../stores/notificationStore';

export const NotificationToaster: React.FC = () => {
  const { position, offsetX, offsetY, duration, theme, richColors, closeButton, expand, visibleToasts } =
    useNotificationStore();

  const isBottom = position.startsWith('bottom');
  const isRight = position.endsWith('right');
  const isLeft = position.endsWith('left');

  const offset: { top?: number; bottom?: number; left?: number; right?: number } = {};
  if (isBottom) offset.bottom = offsetY; else offset.top = offsetY;
  if (isRight) offset.right = offsetX;
  else if (isLeft) offset.left = offsetX;

  return (
    <Toaster
      position={position}
      theme={theme}
      richColors={richColors}
      closeButton={closeButton}
      expand={expand}
      visibleToasts={visibleToasts}
      duration={duration}
      offset={offset}
    />
  );
};
