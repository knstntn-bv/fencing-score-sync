import { useEffect } from 'react';
import { KeepAwake } from '@capacitor-community/keep-awake';

export const useKeepAwake = (enabled: boolean) => {
  useEffect(() => {
    const enableKeepAwake = async () => {
      try {
        if (enabled) {
          await KeepAwake.keepAwake();
        } else {
          await KeepAwake.allowSleep();
        }
      } catch (error) {
        // Fallback for web - use Screen Wake Lock API if available
        if ('wakeLock' in navigator && enabled) {
          try {
            await (navigator as any).wakeLock.request('screen');
          } catch (wakeLockError) {
            console.log('Wake lock not supported or failed');
          }
        }
      }
    };

    enableKeepAwake();

    // Cleanup on unmount
    return () => {
      if (!enabled) {
        KeepAwake.allowSleep().catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, [enabled]);
};