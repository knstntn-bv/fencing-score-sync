import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, DoorOpen, History as HistoryIcon, LogOut, Trophy, Users } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export default function Account() {
  const {
    user,
    clubId,
    clubName,
    clubRole,
    personName,
    personPublicId,
    saveName,
    createClub,
    renameClub,
    leaveClub,
    signOut,
  } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOwner = clubRole === "owner";

  const [displayName, setDisplayName] = useState(personName ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [clubNameDraft, setClubNameDraft] = useState(clubName ?? "");
  const [clubBusy, setClubBusy] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);

  const [newClubName, setNewClubName] = useState("");
  const [creatingClub, setCreatingClub] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(personName ?? "");
  }, [personName]);

  useEffect(() => {
    setClubNameDraft(clubName ?? "");
  }, [clubName]);

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  const handleSaveName = async (event: FormEvent) => {
    event.preventDefault();
    setNameError(null);
    if (!displayName.trim()) {
      setNameError("Enter your name.");
      return;
    }
    setNameBusy(true);
    const result = await saveName(displayName.trim());
    if (result.error) {
      setNameError(result.error);
    } else {
      toast.success("Name saved");
      await queryClient.invalidateQueries({ queryKey: ["fencers"] });
    }
    setNameBusy(false);
  };

  const handleRenameClub = async (event: FormEvent) => {
    event.preventDefault();
    setClubError(null);
    if (!clubNameDraft.trim()) {
      setClubError("Enter a club name.");
      return;
    }
    setClubBusy(true);
    const result = await renameClub(clubNameDraft.trim());
    if (result.error) {
      setClubError(result.error);
    } else {
      toast.success("Club name saved");
    }
    setClubBusy(false);
  };

  const handleCreateClub = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    if (!newClubName.trim()) {
      setCreateError("Enter a club name.");
      return;
    }
    setCreatingClub(true);
    const result = await createClub(newClubName.trim());
    if (result.error) {
      setCreateError(result.error);
    } else {
      toast.success("Club created");
      setNewClubName("");
    }
    setCreatingClub(false);
  };

  const handleLeaveClub = async () => {
    setLeaveError(null);
    setLeaving(true);
    const result = await leaveClub();
    setLeaving(false);
    if (result.error) {
      setLeaveError(result.error);
      return;
    }
    setLeaveOpen(false);
    toast.success("Left the club");
    await queryClient.invalidateQueries({ queryKey: ["fencers"] });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/settings">
            <Button variant="outline" size="icon" aria-label="Back to settings">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-primary">Account</h1>
            <p className="text-muted-foreground">Signed in as {user.email}.</p>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your name</CardTitle>
              <CardDescription>
                {clubId
                  ? "This name is also used on the club roster."
                  : "Saved on your account. You join the roster with it if you create a club."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-public-id">ID</Label>
                <Input
                  id="account-public-id"
                  value={personPublicId ?? ""}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <form onSubmit={(event) => void handleSaveName(event)} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="account-display-name">Name</Label>
                  <Input
                    id="account-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                  />
                </div>
                {nameError ? <p className="text-sm text-destructive">{nameError}</p> : null}
                <Button type="submit" disabled={nameBusy}>
                  {nameBusy ? "Saving…" : "Save name"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {clubId && isOwner ? (
            <Card>
              <CardHeader>
                <CardTitle>Club name</CardTitle>
                <CardDescription>Only the owner can change this.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void handleRenameClub(event)} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="account-club-name">Club</Label>
                    <Input
                      id="account-club-name"
                      value={clubNameDraft}
                      onChange={(event) => setClubNameDraft(event.target.value)}
                      autoComplete="organization"
                    />
                  </div>
                  {clubError ? <p className="text-sm text-destructive">{clubError}</p> : null}
                  <Button type="submit" disabled={clubBusy}>
                    {clubBusy ? "Saving…" : "Save club name"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {clubId && !isOwner ? (
            <Card>
              <CardHeader>
                <CardTitle>Club</CardTitle>
                <CardDescription>{clubName ?? "Club"}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {!clubId ? (
            <Card>
              <CardHeader>
                <CardTitle>Create a club</CardTitle>
                <CardDescription>
                  You join the roster as owner using your name
                  {personName ? ` (${personName})` : ""}. Roster, history, and
                  tournaments stay locked until then.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void handleCreateClub(event)} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="account-new-club-name">Club name</Label>
                    <Input
                      id="account-new-club-name"
                      value={newClubName}
                      onChange={(event) => setNewClubName(event.target.value)}
                      autoComplete="organization"
                    />
                  </div>
                  {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
                  <Button type="submit" disabled={creatingClub}>
                    {creatingClub ? "Creating…" : "Create club"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {clubId ? (
            <Card>
              <CardHeader>
                <CardTitle>Club pages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/fencers">
                    <Users className="h-4 w-4 mr-2" />
                    Manage fencers
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/tournaments">
                    <Trophy className="h-4 w-4 mr-2" />
                    Tournaments
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/history">
                    <HistoryIcon className="h-4 w-4 mr-2" />
                    History & stats
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {clubId ? (
            <Card>
              <CardHeader>
                <CardTitle>Leave club</CardTitle>
                <CardDescription>
                  You leave the roster. Your id and bout history stay. The last
                  owner cannot leave.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {leaveError ? <p className="text-sm text-destructive">{leaveError}</p> : null}
                <AlertDialog
                  open={leaveOpen}
                  onOpenChange={(open) => {
                    setLeaveOpen(open);
                    if (!open) setLeaveError(null);
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full" disabled={leaving}>
                      <DoorOpen className="h-4 w-4 mr-2" />
                      Leave {clubName ?? "club"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Leave {clubName ?? "this club"}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You leave the roster. Your id and bout history stay. You can
                        create a new club afterwards. The last owner cannot leave.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {leaveError ? <p className="text-sm text-destructive">{leaveError}</p> : null}
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={leaving}
                        onClick={(event) => {
                          event.preventDefault();
                          void handleLeaveClub();
                        }}
                      >
                        {leaving ? "Leaving…" : "Leave club"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ) : null}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              void signOut();
              navigate("/");
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
