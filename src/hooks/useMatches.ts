import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { fencerErrorMessage } from "@/lib/fencers";
import { listMatches } from "@/lib/matches";

export const MATCHES_QUERY_KEY = ["matches"] as const;

export function useMatches() {
  const { user, configured } = useAuth();
  const clubId = user?.id;
  const enabled = configured && Boolean(clubId);

  const query = useQuery({
    queryKey: [...MATCHES_QUERY_KEY, clubId],
    enabled,
    queryFn: listMatches,
  });

  return {
    enabled,
    matches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? fencerErrorMessage(query.error, "Could not load bout history.") : null,
  };
}
