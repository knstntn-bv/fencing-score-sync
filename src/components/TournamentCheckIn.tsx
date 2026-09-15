import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Hash, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Fencer } from "@/types/fencing";
import type { TournamentParticipant } from "@/types/tournament";

type CheckInDialog = "roster" | "free" | "id" | null;

export function TournamentCheckIn({
  participants,
  roster,
  rosterLoading,
  busy,
  onCheckIn,
  onCheckInGuest,
  onCheckInById,
  onCheckOut,
  errorMessage,
}: {
  participants: TournamentParticipant[];
  roster: Fencer[];
  rosterLoading: boolean;
  busy: boolean;
  onCheckIn: (fencerId: string) => Promise<void>;
  onCheckInGuest: (input: { name: string; clubName?: string }) => Promise<void>;
  onCheckInById: (publicId: string) => Promise<void>;
  onCheckOut: (fencerId: string) => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const [dialog, setDialog] = useState<CheckInDialog>(null);
  const checkedInIds = useMemo(
    () => new Set(participants.map((row) => row.fencerId)),
    [participants]
  );
  const listed = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name)),
    [participants]
  );

  return (
    <section className="space-y-4 mb-10">
      <div>
        <h2 className="text-lg font-medium">Check-in</h2>
        <p className="text-sm text-muted-foreground">
          Add who is fencing today. Remove anyone who should not be in the draw.
        </p>
      </div>

      {rosterLoading ? (
        <p className="text-muted-foreground">Loading roster…</p>
      ) : (
        <div className="space-y-4">
          {listed.length === 0 ? (
            <p className="text-muted-foreground">No one is checked in yet.</p>
          ) : (
            <ul className="space-y-3">
              {listed.map((row) => (
                <li key={row.fencerId}>
                  <CheckedInRow
                    name={row.name}
                    clubName={row.clubName}
                    disabled={busy}
                    onRemove={async () => {
                      try {
                        await onCheckOut(row.fencerId);
                      } catch (error) {
                        toast.error(errorMessage(error));
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => setDialog("roster")}
            >
              <Users className="h-4 w-4 mr-2" />
              From roster
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => setDialog("free")}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add free fencer
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => setDialog("id")}
            >
              <Hash className="h-4 w-4 mr-2" />
              Add by ID
            </Button>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {participants.length < 2
          ? "Check in at least two fencers to continue."
          : `${participants.length} checked in.`}
      </p>

      <RosterCheckInDialog
        open={dialog === "roster"}
        roster={roster}
        checkedInIds={checkedInIds}
        busy={busy}
        onOpenChange={(open) => setDialog(open ? "roster" : null)}
        onCheckIn={onCheckIn}
        errorMessage={errorMessage}
      />
      <FreeFencerDialog
        open={dialog === "free"}
        busy={busy}
        onOpenChange={(open) => setDialog(open ? "free" : null)}
        onAdd={onCheckInGuest}
        errorMessage={errorMessage}
      />
      <IdCheckInDialog
        open={dialog === "id"}
        busy={busy}
        onOpenChange={(open) => setDialog(open ? "id" : null)}
        onAdd={onCheckInById}
        errorMessage={errorMessage}
      />
    </section>
  );
}

function CheckedInRow({
  name,
  clubName,
  disabled,
  onRemove,
}: {
  name: string;
  clubName: string | null;
  disabled: boolean;
  onRemove: () => Promise<void>;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-lg truncate">{name}</p>
          {clubName ? <p className="text-sm text-muted-foreground truncate">{clubName}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${name}`}
          onClick={() => void onRemove()}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RosterCheckInDialog({
  open,
  roster,
  checkedInIds,
  busy,
  onOpenChange,
  onCheckIn,
  errorMessage,
}: {
  open: boolean;
  roster: Fencer[];
  checkedInIds: Set<string>;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckIn: (fencerId: string) => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const available = roster.filter(
    (fencer) => !checkedInIds.has(fencer.id) && (fencer.userId == null || !checkedInIds.has(fencer.userId))
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  const toggle = (id: string, next: boolean) => {
    setSelected((current) => {
      if (next) return current.includes(id) ? current : [...current, id];
      return current.filter((row) => row !== id);
    });
  };

  const addSelected = async () => {
    if (saving || selected.length === 0) return;
    setSaving(true);
    try {
      for (const fencerId of selected) {
        await onCheckIn(fencerId);
      }
      toast.success(selected.length === 1 ? "Fencer checked in" : `${selected.length} checked in`);
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>From roster</DialogTitle>
          <DialogDescription>Choose club fencers who are fencing today.</DialogDescription>
        </DialogHeader>
        {roster.length === 0 ? (
          <p className="text-muted-foreground">
            No fencers in the roster.{" "}
            <Link to="/fencers" className="text-primary underline underline-offset-4">
              Add names on Fencers
            </Link>
            .
          </p>
        ) : available.length === 0 ? (
          <p className="text-muted-foreground">Everyone from the roster is already checked in.</p>
        ) : (
          <div className="max-h-[min(24rem,calc(85vh-11rem))] overflow-y-auto overscroll-contain -mx-1 px-1">
            <ul className="space-y-3">
              {available.map((fencer) => {
                const checked = selected.includes(fencer.id);
                return (
                  <li key={fencer.id}>
                    <Card>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <label
                          htmlFor={`roster-check-in-${fencer.id}`}
                          className="font-medium text-lg min-w-0 truncate"
                        >
                          {fencer.name}
                        </label>
                        <Checkbox
                          id={`roster-check-in-${fencer.id}`}
                          checked={checked}
                          disabled={busy || saving}
                          onCheckedChange={(next) => toggle(fencer.id, next === true)}
                          aria-label={`Select ${fencer.name}`}
                        />
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || saving || selected.length === 0}
            onClick={() => void addSelected()}
          >
            {saving ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreeFencerDialog({
  open,
  busy,
  onOpenChange,
  onAdd,
  errorMessage,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: { name: string; clubName?: string }) => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const [name, setName] = useState("");
  const [clubName, setClubName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setClubName("");
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || saving || busy) return;
    setSaving(true);
    try {
      await onAdd({ name: nextName, clubName });
      toast.success("Fencer checked in");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Add free fencer</DialogTitle>
            <DialogDescription>Named here only. They stay off the club roster.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-2">
              <Label htmlFor="free-fencer-name">Name</Label>
              <Input
                id="free-fencer-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="free-fencer-club">Club (optional)</Label>
              <Input
                id="free-fencer-club"
                value={clubName}
                onChange={(event) => setClubName(event.target.value)}
                placeholder="Club"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || saving || !name.trim()}>
              {saving ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IdCheckInDialog({
  open,
  busy,
  onOpenChange,
  onAdd,
  errorMessage,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (publicId: string) => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const [publicId, setPublicId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setPublicId("");
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextId = publicId.trim();
    if (!nextId || saving || busy) return;
    setSaving(true);
    try {
      await onAdd(nextId);
      toast.success("Fencer checked in");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Add by ID</DialogTitle>
            <DialogDescription>Use the number from the fencer's account settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="check-in-public-id">ID</Label>
            <Input
              id="check-in-public-id"
              value={publicId}
              onChange={(event) => setPublicId(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="1001"
              autoComplete="off"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || saving || !publicId.trim()}>
              {saving ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
