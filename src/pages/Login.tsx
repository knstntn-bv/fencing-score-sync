import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const { signIn, signUp, enterGuestBout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"in" | "up" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setBusy("in");
    const result = await signIn(email.trim(), password);
    if (result.error) setError(result.error);
    setBusy(null);
  };

  const handleSignUp = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy("up");
    const result = await signUp(email.trim(), password);
    if (result.error) {
      setError(result.error);
    } else if (result.needsEmailConfirmation) {
      setInfo("Check your email to confirm the club account, then sign in.");
    }
    setBusy(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-primary">Fencing Scorer</CardTitle>
          <CardDescription>
            Sign in with the club account to load fencers and save bouts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
            <Button type="submit" className="w-full" size="lg" disabled={busy !== null}>
              {busy === "in" ? "Signing in…" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy !== null}
              onClick={handleSignUp}
            >
              {busy === "up" ? "Creating…" : "Create club account"}
            </Button>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              size="lg"
              disabled={busy !== null}
              onClick={() => {
                enterGuestBout();
                navigate("/");
              }}
            >
              Quick bout
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Timer and scores only. No fencer list and no saved results.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
