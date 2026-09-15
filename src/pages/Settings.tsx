import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, History as HistoryIcon, LogOut, Save, Trophy, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import type { ClubSettings } from "@/lib/settings";

interface SettingsProps {
  settings: ClubSettings;
  onSave: (settings: ClubSettings) => void;
}

const Settings = ({ settings, onSave }: SettingsProps) => {
  const { configured, user, clubId, profileName, guestBout, signOut, exitGuestBout, createClub } =
    useAuth();
  const navigate = useNavigate();
  const guestScoreboard = guestBout && !user;
  const noClub = Boolean(user && !clubId);
  const [timeLimit, setTimeLimit] = useState(settings.timeLimit);
  const [pointsLimit, setPointsLimit] = useState(settings.pointsLimit);
  const [clubName, setClubName] = useState("");
  const [creatingClub, setCreatingClub] = useState(false);
  const [clubError, setClubError] = useState<string | null>(null);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes}:00`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSave = () => {
    onSave({ timeLimit, pointsLimit });
    toast.success("Settings saved on this device");
  };

  const handleCreateClub = async (event: FormEvent) => {
    event.preventDefault();
    setClubError(null);
    if (!clubName.trim()) {
      setClubError("Enter a club name.");
      return;
    }
    setCreatingClub(true);
    const result = await createClub(clubName.trim());
    if (result.error) {
      setClubError(result.error);
    } else {
      toast.success("Club created");
      navigate("/");
    }
    setCreatingClub(false);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          {noClub ? null : (
            <Link to="/">
              <Button variant="outline" size="icon" aria-label="Back to scoreboard">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          )}
          {guestScoreboard ? (
            <Button
              variant="outline"
              onClick={() => {
                exitGuestBout();
                navigate("/");
              }}
            >
              Sign in
            </Button>
          ) : null}
          <div>
            <h1 className="text-3xl font-display font-bold text-primary">
              Tournament Settings
            </h1>
            <p className="text-muted-foreground">
              Limits stay on this device after reload.
            </p>
          </div>
        </div>

        {/* Settings Cards */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Time Limit
              </CardTitle>
              <CardDescription>
                Set the duration for each match (1-5 minutes, 10-second increments)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Duration: {formatTime(timeLimit)}</Label>
                <Slider
                  value={[timeLimit]}
                  onValueChange={(value) => setTimeLimit(value[0])}
                  min={60}
                  max={300}
                  step={10}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>1:00</span>
                  <span>5:00</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Points Limit
              </CardTitle>
              <CardDescription>
                Set the winning score (5-20 points)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>First to: {pointsLimit} points</Label>
                <Slider
                  value={[pointsLimit]}
                  onValueChange={(value) => setPointsLimit(value[0])}
                  min={5}
                  max={20}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>5 points</span>
                  <span>20 points</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} className="w-full" size="lg">
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>

          {configured && user && noClub ? (
            <Card>
              <CardHeader>
                <CardTitle>Create a club</CardTitle>
                <CardDescription>
                  You join the roster as owner using your name
                  {profileName ? ` (${profileName})` : ""}. Roster, history, and
                  tournaments stay locked until then.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void handleCreateClub(event)} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="settings-club-name">Club name</Label>
                    <Input
                      id="settings-club-name"
                      value={clubName}
                      onChange={(event) => setClubName(event.target.value)}
                      autoComplete="organization"
                    />
                  </div>
                  {clubError ? <p className="text-sm text-destructive">{clubError}</p> : null}
                  <Button type="submit" className="w-full" disabled={creatingClub}>
                    {creatingClub ? "Creating…" : "Create club"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {configured && user ? (
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>
                  Signed in as {user.email}
                  {profileName ? ` · ${profileName}` : ""}.
                  {clubId
                    ? " Fencers and bout history belong to this club."
                    : " Create a club to manage fencers, history, and tournaments."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {clubId ? (
                  <>
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
                  </>
                ) : null}
                <Button variant="outline" className="w-full" onClick={() => void signOut()}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Settings;
