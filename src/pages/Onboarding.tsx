import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export default function Onboarding() {
  const { clubId, completeSetup, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [clubName, setClubName] = useState("");
  const [busy, setBusy] = useState<"club" | "skip" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const needsClubChoice = !clubId;

  const finish = async (displayName: string, nextClubName: string | null) => {
    const result = await completeSetup(displayName, nextClubName);
    if (result.error) {
      setError(result.error);
      return false;
    }
    navigate("/", { replace: true });
    return true;
  };

  const handleCreateClub = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!clubName.trim()) {
      setError("Enter a club name.");
      return;
    }
    setBusy("club");
    await finish(name.trim(), clubName.trim());
    setBusy(null);
  };

  const handleSkip = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    setBusy("skip");
    await finish(name.trim(), null);
    setBusy(null);
  };

  const handleContinue = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    setBusy("save");
    await finish(name.trim(), null);
    setBusy(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-primary">Your name</CardTitle>
          <CardDescription>
            {needsClubChoice
              ? "This name stays on your account. If you create a club, you are added to the roster as owner."
              : "Add a display name to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={needsClubChoice ? handleCreateClub : handleContinue}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                autoFocus
                required
              />
            </div>
            {needsClubChoice ? (
              <div className="space-y-2">
                <Label htmlFor="club-name">Club name</Label>
                <Input
                  id="club-name"
                  value={clubName}
                  onChange={(event) => setClubName(event.target.value)}
                  autoComplete="organization"
                />
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {needsClubChoice ? (
              <>
                <Button type="submit" className="w-full" size="lg" disabled={busy !== null}>
                  {busy === "club" ? "Creating…" : "Create club"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => void handleSkip()}
                >
                  {busy === "skip" ? "Saving…" : "Skip"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Skip keeps your name and opens the scoreboard. You can create a club later in Account.
                </p>
              </>
            ) : (
              <Button type="submit" className="w-full" size="lg" disabled={busy !== null}>
                {busy === "save" ? "Saving…" : "Continue"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy !== null}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
