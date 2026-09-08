import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { fencerErrorMessage } from "@/lib/fencers";
import { listMatches } from "@/lib/matches";

export const MATCHES_QUERY_KEY = ["matches"] as const;

export function useMatches() {
  const { clubId, configured } = useAuth();
  const enabled = configured && Boolean(clubId);

  const query = useQuery({
    queryKey: [...MATCHES_QUERY_KEY, clubId],
    enabled,
    queryFn: () => {
      if (!clubId) throw new Error("Not signed in.");
      return listMatches(clubId);
    },
  });

  return {
    enabled,
    matches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? fencerErrorMessage(query.error, "Could not load bout history.") : null,
  };
}
