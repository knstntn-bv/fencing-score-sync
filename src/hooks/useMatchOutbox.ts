import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { MATCHES_QUERY_KEY } from "@/hooks/useMatches";
import {
  matchOutboxCount,
  OUTBOX_CHANGED_EVENT,
  readMatchOutbox,
  writeMatchOutbox,
} from "@/lib/matchOutbox";
import { saveMatch } from "@/lib/matches";
import { isNetworkError } from "@/lib/networkError";

export function useMatchOutboxCount(clubId: string | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!clubId) {
      setCount(0);
      return;
    }
    const refresh = () => setCount(matchOutboxCount(clubId));
    refresh();
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [clubId]);

  return count;
}

export function useMatchOutboxFlush() {
  const { user, configured } = useAuth();
  const queryClient = useQueryClient();
  const clubId = user?.id;

  const flush = useCallback(async () => {
    if (!configured || !clubId) return;
    const pending = readMatchOutbox(clubId);
    if (pending.length === 0) return;

    const remaining = [...pending];
    let uploaded = 0;

    while (remaining.length > 0) {
      const item = remaining[0];
      try {
        await saveMatch(item);
        remaining.shift();
        uploaded += 1;
      } catch (error) {
        if (isNetworkError(error)) break;
        remaining.shift();
      }
    }

    writeMatchOutbox(clubId, remaining);
    if (uploaded > 0) {
      await queryClient.invalidateQueries({ queryKey: [...MATCHES_QUERY_KEY, clubId] });
      toast.success(uploaded === 1 ? "Queued bout uploaded" : `${uploaded} queued bouts uploaded`);
    }
  }, [clubId, configured, queryClient]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);
}
