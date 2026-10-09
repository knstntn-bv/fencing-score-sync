import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { OutboxContext } from "@/context/outbox";
import { MATCHES_QUERY_KEY } from "@/hooks/useMatches";
import { flushMatchOutbox, getMatchOutboxStore, OUTBOX_CHANGED_EVENT, OUTBOX_RETRY_EVENT } from "@/lib/matchOutbox";
import { outboxErrorMessage } from "@/lib/matchOutboxSync";

const OUTBOX_KEY = ["match-outbox"] as const;

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { clubId, user, configured } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const scope = useRef<object | null>(null);
  const activeRetry = useRef<{ token: object; task: ReturnType<typeof flushMatchOutbox> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const enabled = configured && Boolean(clubId && userId);
  const query = useQuery({
    queryKey: [...OUTBOX_KEY, clubId],
    enabled,
    retry: false,
    queryFn: () => getMatchOutboxStore().read(clubId!),
  });

  const retry = useCallback(async () => {
    const token = scope.current;
    if (!enabled || !clubId || !token) return;
    const task = flushMatchOutbox(clubId, () => scope.current === token);
    if (activeRetry.current?.token === token && activeRetry.current.task === task) return;
    activeRetry.current = { token, task };
    setBusy(true);
    setSyncError(null);
    try {
      const report = await task;
      if (scope.current !== token) return;
      setSyncError(report.error);
      if (report.uploaded > 0) {
        await queryClient.invalidateQueries({ queryKey: [...MATCHES_QUERY_KEY, clubId] });
        toast.success(report.uploaded === 1 ? "Queued bout uploaded" : `${report.uploaded} queued bouts uploaded`);
      }
    } catch (error) {
      if (scope.current === token) setSyncError(outboxErrorMessage(error));
    } finally {
      if (scope.current === token) {
        activeRetry.current = null;
        setBusy(false);
        await queryClient.invalidateQueries({ queryKey: [...OUTBOX_KEY, clubId] });
      }
    }
  }, [clubId, enabled, queryClient]);

  useEffect(() => {
    scope.current = {};
    setBusy(false);
    setSyncError(null);
    void retry();
    const onRetry = () => { void retry(); };
    window.addEventListener("online", onRetry);
    window.addEventListener(OUTBOX_RETRY_EVENT, onRetry);
    return () => {
      scope.current = null;
      window.removeEventListener("online", onRetry);
      window.removeEventListener(OUTBOX_RETRY_EVENT, onRetry);
    };
  }, [retry, userId]);

  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: OUTBOX_KEY }); };
    window.addEventListener(OUTBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_CHANGED_EVENT, refresh);
  }, [queryClient]);

  const entries = enabled ? query.data ?? [] : [];
  const error = !enabled ? null : query.error ? outboxErrorMessage(query.error)
    : syncError ?? entries.find(entry => entry.error)?.error ?? null;
  return <OutboxContext.Provider value={{ entries, error, busy, retry }}>{children}</OutboxContext.Provider>;
}
