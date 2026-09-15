import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, BarChart3, Check, Hash, Link2, Pencil, RotateCcw, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ClubPageHeader } from "@/components/ClubNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import { isLinkedFencer } from "@/lib/fencers";
import { lookupCheckinByPublicId, normalizePublicId, type CheckInLookup } from "@/lib/tournaments";
import type { Fencer } from "@/types/fencing";

type LinkDialogState = { mode: "add" } | { mode: "attach"; fencer: Fencer };

export default function FencersPage() {
  const { configured, user, clubId, retryAccount } = useAuth();
  const fencers = useFencers();
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await fencers.create.mutateAsync(name);
      setName("");
      toast.success("Fencer added");
    } catch (error) {
      toast.error(fencers.mutationError(error));
    }
  };

  if (!configured) {
    return (
      <FencersShell>
        <p className="text-muted-foreground">
          Connect Supabase to manage the club roster.
        </p>
      </FencersShell>
    );
  }

  return (
    <FencersShell>
      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 space-y-2">
          <Label htmlFor="fencer-name">Name</Label>
          <Input
            id="fencer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Add a fencer"
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          className="sm:self-end"
          disabled={fencers.create.isPending || !name.trim()}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          className="sm:self-end"
          disabled={fencers.addById.isPending}
          onClick={() => setLinkDialog({ mode: "add" })}
        >
          <Hash className="h-4 w-4 mr-2" />
          Add by ID
        </Button>
      </form>

      {fencers.error ? (
        <p className="text-sm text-destructive mb-4">{fencers.error}</p>
      ) : null}

      {fencers.isLoading ? (
        <p className="text-muted-foreground">Loading roster…</p>
      ) : fencers.active.length === 0 ? (
        <p className="text-muted-foreground mb-6">
          No fencers yet. Add a name or add an account by ID.
        </p>
      ) : (
        <ul className="space-y-3 mb-6">
          {fencers.active.map((fencer) => (
            <li key={fencer.id}>
              <FencerRow
                fencer={fencer}
                onRename={async (nextName) => {
                  try {
                    await fencers.rename.mutateAsync({ id: fencer.id, name: nextName });
                    toast.success("Name updated");
                  } catch (error) {
                    toast.error(fencers.mutationError(error));
                    throw error;
                  }
                }}
                onLink={() => setLinkDialog({ mode: "attach", fencer })}
                onArchive={async () => {
                  try {
                    await fencers.archive.mutateAsync(fencer);
                    toast.success(
                      isLinkedFencer(fencer) ? "Account unlinked and archived" : "Fencer archived"
                    );
                    if (fencer.userId && fencer.userId === user?.id) retryAccount();
                  } catch (error) {
                    toast.error(fencers.mutationError(error));
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {fencers.archived.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-archived" className="text-muted-foreground">
              Show archived ({fencers.archived.length})
            </Label>
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
          </div>
          {showArchived ? (
            <ul className="space-y-3">
              {fencers.archived.map((fencer) => (
                <li key={fencer.id}>
                  <Card className="opacity-80">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{fencer.name}</p>
                        <p className="text-xs text-muted-foreground">Archived</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <FencerStatsButton fencer={fencer} />
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Restore ${fencer.name}`}
                          onClick={async () => {
                            try {
                              await fencers.restore.mutateAsync(fencer.id);
                              toast.success("Fencer restored");
                            } catch (error) {
                              toast.error(fencers.mutationError(error));
                            }
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <LinkAccountDialog
        open={linkDialog !== null}
        mode={linkDialog?.mode ?? "add"}
        fencer={linkDialog?.mode === "attach" ? linkDialog.fencer : null}
        clubId={clubId}
        busy={fencers.link.isPending || fencers.addById.isPending}
        errorMessage={fencers.mutationError}
        onOpenChange={(open) => {
          if (!open) setLinkDialog(null);
        }}
        onConfirm={async (publicId) => {
          if (linkDialog?.mode === "attach") {
            await fencers.link.mutateAsync({ fencerId: linkDialog.fencer.id, publicId });
            toast.success("Account linked");
          } else {
            await fencers.addById.mutateAsync(publicId);
            toast.success("Account added to the roster");
          }
        }}
      />
    </FencersShell>
  );
}

function FencersShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <ClubPageHeader
          title="Fencers"
          subtitle="Club roster. Archive keeps bout history intact."
          icon={Users}
        />
        {children}
      </div>
    </div>
  );
}

function FencerRow({
  fencer,
  onRename,
  onLink,
  onArchive,
}: {
  fencer: Fencer;
  onRename: (name: string) => Promise<void>;
  onLink: () => void;
  onArchive: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fencer.name);
  const [busy, setBusy] = useState(false);

  const saveRename = async () => {
    setBusy(true);
    try {
      await onRename(draft);
      setEditing(false);
    } catch {
      // Toast is handled by the caller.
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveRename();
              }
              if (event.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex gap-2">
            <Button size="icon" onClick={() => void saveRename()} disabled={busy || !draft.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                setDraft(fencer.name);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const linked = isLinkedFencer(fencer);

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-lg min-w-0 truncate">{fencer.name}</p>
          {linked ? <p className="text-xs text-muted-foreground">Account</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <FencerStatsButton fencer={fencer} />
          {linked ? null : (
            <>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Link account to ${fencer.name}`}
                onClick={onLink}
              >
                <Link2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Rename ${fencer.name}`}
                onClick={() => {
                  setDraft(fencer.name);
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={linked ? `Unlink and archive ${fencer.name}` : `Archive ${fencer.name}`}
              >
                <Archive className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {linked ? `Unlink and archive ${fencer.name}?` : `Archive ${fencer.name}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {linked
                    ? "This unlinks their account and archives the roster row. Bout history stays. The last owner cannot be removed."
                    : "They leave the roster but stay in bout history. You can restore them later."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onArchive()}>
                  {linked ? "Unlink" : "Archive"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function LinkAccountDialog({
  open,
  mode,
  fencer,
  clubId,
  busy,
  errorMessage,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  mode: "add" | "attach";
  fencer: Fencer | null;
  clubId: string | null;
  busy: boolean;
  errorMessage: (error: unknown) => string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (publicId: string) => Promise<void>;
}) {
  const [publicId, setPublicId] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<CheckInLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPublicId("");
      setPreview(null);
      setLookupError(null);
      setLookingUp(false);
      setSaving(false);
    }
  }, [open]);

  const blockedReason = preview
    ? preview.fencerId
      ? "That account is already on this roster."
      : preview.clubName
        ? `That account already belongs to ${preview.clubName}.`
        : null
    : null;
  const canConfirm = Boolean(preview && !blockedReason && !busy && !saving);

  const lookUp = async (event: FormEvent) => {
    event.preventDefault();
    if (lookingUp || saving || busy) return;
    if (!clubId) {
      setLookupError("You need to be in a club.");
      return;
    }
    if (!normalizePublicId(publicId)) {
      setLookupError("Enter a valid ID.");
      setPreview(null);
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    setPreview(null);
    try {
      const found = await lookupCheckinByPublicId(publicId, clubId);
      if (!found) {
        setLookupError("No account has that ID.");
        return;
      }
      setPreview(found);
    } catch (error) {
      setLookupError(errorMessage(error));
    } finally {
      setLookingUp(false);
    }
  };

  const confirm = async () => {
    if (!preview || blockedReason || saving || busy) return;
    const id = normalizePublicId(publicId);
    if (!id) return;
    setSaving(true);
    try {
      await onConfirm(id);
      onOpenChange(false);
    } catch (error) {
      setLookupError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            if (preview && canConfirm) {
              event.preventDefault();
              void confirm();
              return;
            }
            void lookUp(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === "attach" ? `Link ${fencer?.name ?? "fencer"}` : "Add by ID"}</DialogTitle>
            <DialogDescription>
              {mode === "attach"
                ? "Use the number from their Account. This roster name will take the account name."
                : "Use the number from their Account. They join the roster with that name. If they already have a roster name, link that row instead."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="roster-public-id">ID</Label>
              <Input
                id="roster-public-id"
                value={publicId}
                onChange={(event) => {
                  setPublicId(event.target.value);
                  setPreview(null);
                  setLookupError(null);
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="1001"
                autoComplete="off"
                autoFocus
              />
            </div>
            {preview ? (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <p className="font-medium">{preview.name}</p>
                {blockedReason ? (
                  <p className="text-sm text-destructive">{blockedReason}</p>
                ) : mode === "attach" ? (
                  <p className="text-sm text-muted-foreground">
                    {fencer && fencer.name !== preview.name
                      ? `${fencer.name} will become ${preview.name}.`
                      : "This roster name will be linked to the account."}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Will be added to the roster.</p>
                )}
              </div>
            ) : null}
            {lookupError ? <p className="text-sm text-destructive">{lookupError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {preview && !blockedReason ? (
              <Button type="submit" disabled={!canConfirm}>
                {saving ? "Saving…" : mode === "attach" ? "Link" : "Add"}
              </Button>
            ) : (
              <Button type="submit" disabled={lookingUp || busy || !publicId.trim()}>
                {lookingUp ? "Looking up…" : "Look up"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FencerStatsButton({ fencer }: { fencer: Fencer }) {
  return (
    <Button variant="outline" size="icon" asChild>
      <Link to={`/fencers/${fencer.id}/stats`} aria-label={`${fencer.name} stats`}>
        <BarChart3 className="h-4 w-4" />
      </Link>
    </Button>
  );
}
