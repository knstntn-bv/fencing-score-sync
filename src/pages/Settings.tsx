import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BarChart3, History as HistoryIcon, LogOut, Save, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import type { ClubSettings } from "@/lib/settings";

interface SettingsProps {
  settings: ClubSettings;
  onSave: (settings: ClubSettings) => void;
}

const Settings = ({ settings, onSave }: SettingsProps) => {
  const { configured, user, guestBout, signOut, exitGuestBout } = useAuth();
  const navigate = useNavigate();
  const guestScoreboard = guestBout && !user;
  const [timeLimit, setTimeLimit] = useState(settings.timeLimit);
  const [pointsLimit, setPointsLimit] = useState(settings.pointsLimit);

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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="outline" size="icon" aria-label="Back to scoreboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
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

          {configured && user ? (
            <Card>
              <CardHeader>
                <CardTitle>Club account</CardTitle>
                <CardDescription>
                  Signed in as {user.email}. Fencers and bout history belong to this account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/fencers">
                    <Users className="h-4 w-4 mr-2" />
                    Manage fencers
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/history">
                    <HistoryIcon className="h-4 w-4 mr-2" />
                    Bout history
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="w-full">
                  <Link to="/stats">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Fencer stats
                  </Link>
                </Button>
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