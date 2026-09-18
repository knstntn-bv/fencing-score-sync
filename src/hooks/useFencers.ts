import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  addLinkedFencer,
  archiveFencer,
  createFencer,
  fencerErrorMessage,
  mergeNicknameIntoPerson,
  listFencers,
  readFencerCache,
  renameFencer,
  restoreFencer,
  writeFencerCache,
} from "@/lib/fencers";
import type { Fencer } from "@/types/fencing";

const FENCERS_KEY = ["fencers"] as const;

export function useFencers() {
  const { clubId, configured } = useAuth();
  const queryClient = useQueryClient();
  const enabled = configured && Boolean(clubId);

  const query = useQuery({
    queryKey: [...FENCERS_KEY, clubId],
    enabled,
    queryFn: () => {
      if (!clubId) throw new Error("Not signed in.");
      return listFencers(clubId);
    },
    placeholderData: clubId ? readFencerCache(clubId) : undefined,
  });

  useEffect(() => {
    if (clubId && query.data) {
      writeFencerCache(clubId, query.data);
    }
  }, [clubId, query.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...FENCERS_KEY, clubId] });

  const create = useMutation({
    mutationFn: (name: string) => {
      if (!clubId) throw new Error("Not signed in.");
      return createFencer(clubId, name);
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFencer(id, name),
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: (fencer: Fencer) => archiveFencer(fencer),
    onSuccess: invalidate,
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreFencer(id),
    onSuccess: invalidate,
  });

  const link = useMutation({
    mutationFn: ({ fencerId, publicId }: { fencerId: string; publicId: string }) =>
      mergeNicknameIntoPerson(fencerId, publicId),
    onSuccess: invalidate,
  });

  const addById = useMutation({
    mutationFn: (publicId: string) => addLinkedFencer(publicId),
    onSuccess: invalidate,
  });

  const fencers: Fencer[] = query.data ?? [];
  const active = fencers.filter((fencer) => !fencer.archivedAt);
  const archived = fencers.filter((fencer) => fencer.archivedAt);

  return {
    enabled,
    clubId,
    active,
    archived,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? fencerErrorMessage(query.error, "Could not load fencers.") : null,
    create,
    rename,
    archive,
    restore,
    link,
    addById,
    mutationError: (error: unknown) => fencerErrorMessage(error, "Request failed."),
  };
}
