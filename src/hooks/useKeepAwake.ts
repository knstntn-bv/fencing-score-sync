import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { acquireScreenWakeLock, createNativeWakeLockQueue } from "@/lib/screenWakeLock";

const nativeWakeLock = createNativeWakeLockQueue(KeepAwake);

export const useKeepAwake = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    if (Capacitor.isNativePlatform()) return nativeWakeLock();
    if (!("wakeLock" in navigator)) return;
    return acquireScreenWakeLock(navigator.wakeLock, document);
  }, [enabled]);
};
