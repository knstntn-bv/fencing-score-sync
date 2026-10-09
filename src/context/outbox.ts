import { createContext, useContext } from "react";
import type { OutboxEntry } from "@/lib/matchOutboxStore";

export const OutboxContext = createContext<{
  entries: OutboxEntry[];
  error: string | null;
  busy: boolean;
  retry: () => Promise<void>;
} | null>(null);

export function useMatchOutbox() {
  const context = useContext(OutboxContext);
  if (!context) throw new Error("useMatchOutbox must be used within OutboxProvider");
  return context;
}
