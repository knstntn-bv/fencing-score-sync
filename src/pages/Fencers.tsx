import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowLeft, Check, Pencil, RotateCcw, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { useFencers } from "@/hooks/useFencers";
import type { Fencer } from "@/types/fencing";

export default function FencersPage() {
  const { configured } = useAuth();
  const fencers = useFencers();
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);

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
      </form>

      {fencers.error ? (
        <p className="text-sm text-destructive mb-4">{fencers.error}</p>
      ) : null}

      {fencers.isLoading ? (
        <p className="text-muted-foreground">Loading roster…</p>
      ) : fencers.active.length === 0 ? (
        <p className="text-muted-foreground mb-6">
          No fencers yet. Add names here before selecting them on the scoreboard.
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
                onArchive={async () => {
                  try {
                    await fencers.archive.mutateAsync(fencer.id);
                    toast.success("Fencer archived");
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
                      <div>
                        <p className="font-medium">{fencer.name}</p>
                        <p className="text-xs text-muted-foreground">Archived</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await fencers.restore.mutateAsync(fencer.id);
                            toast.success("Fencer restored");
                          } catch (error) {
                            toast.error(fencers.mutationError(error));
                          }
                        }}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restore
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </FencersShell>
  );
}

function FencersShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-2">
              <Users className="h-7 w-7" />
              Fencers
            </h1>
            <p className="text-muted-foreground">Club roster. Archive keeps bout history intact.</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function FencerRow({
  fencer,
  onRename,
  onArchive,
}: {
  fencer: Fencer;
  onRename: (name: string) => Promise<void>;
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

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <p className="font-medium text-lg">{fencer.name}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(fencer.name);
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive {fencer.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  They leave the roster but stay in bout history. You can restore them later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onArchive()}>Archive</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
