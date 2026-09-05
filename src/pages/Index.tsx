import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, History as HistoryIcon, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import ScoreDisplay from "@/components/ScoreDisplay";
import Timer from "@/components/Timer";
import FencerPicker from "@/components/FencerPicker";
import SaveResultButton from "@/components/SaveResultButton";
import HoldResetButton from "@/components/HoldResetButton";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useFencers } from "@/hooks/useFencers";
import { useAuth } from "@/context/AuthContext";
import { boutSelectionMessage, resolveBoutSelection } from "@/lib/boutSelection";
import { nextWinnerState, scoreLeader, scoreResults } from "@/lib/boutOutcome";
import { fencerErrorMessage } from "@/lib/fencers";
import { MATCHES_QUERY_KEY } from "@/hooks/useMatches";
import { useMatchOutboxCount } from "@/hooks/useMatchOutbox";
import { enqueueMatchOutbox } from "@/lib/matchOutbox";
import { newMatchId, saveMatch } from "@/lib/matches";
import { isNetworkError } from "@/lib/networkError";
import type { Fencer } from "@/types/fencing";

interface IndexProps {
  settings: {
    timeLimit: number;
    pointsLimit: number;
  };
}

const Index = ({ settings }: IndexProps) => {
  const { user, guestBout, exitGuestBout } = useAuth();
  const guestScoreboard = guestBout && !user;
  const { active } = useFencers();
  const queryClient = useQueryClient();
  const pendingUploads = useMatchOutboxCount(user?.id);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [hasMatchStarted, setHasMatchStarted] = useState(false);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [timerResetId, setTimerResetId] = useState(0);
  const [remainingSec, setRemainingSec] = useState(settings.timeLimit);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [blueFencerId, setBlueFencerId] = useState<string | null>(null);
  const [redFencerId, setRedFencerId] = useState<string | null>(null);
  const [blueNameSnap, setBlueNameSnap] = useState<string | null>(null);
  const [redNameSnap, setRedNameSnap] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const selection = resolveBoutSelection(blueFencerId, redFencerId);
  const selectionHint = boutSelectionMessage(selection);
  const namedBout = !guestScoreboard && selection.status === "ok" && selection.mode === "named";
  const canStartTimer = selection.status === "ok" && !winner;
  const namesLocked = hasMatchStarted || winner !== null;

  const liveBlueName = fencerName(active, blueFencerId, "Fencer 1");
  const liveRedName = fencerName(active, redFencerId, "Fencer 2");
  const blueName = namesLocked ? (blueNameSnap ?? liveBlueName) : liveBlueName;
  const redName = namesLocked ? (redNameSnap ?? liveRedName) : liveRedName;

  const applyScores = (blueScore: number, redScore: number) => {
    setPlayer1Score(blueScore);
    setPlayer2Score(redScore);
    setWinner((current) => nextWinnerState(current, blueScore, redScore, settings.pointsLimit));
  };

  const incrementPlayer1 = () => applyScores(player1Score + 1, player2Score);
  const decrementPlayer1 = () => applyScores(Math.max(0, player1Score - 1), player2Score);
  const incrementPlayer2 = () => applyScores(player1Score, player2Score + 1);
  const decrementPlayer2 = () => applyScores(player1Score, Math.max(0, player2Score - 1));

  const snapshotNames = () => {
    setBlueNameSnap(liveBlueName);
    setRedNameSnap(liveRedName);
  };

  const handleTimerStateChange = (isRunning: boolean) => {
    setIsTimerRunning(isRunning);
    if (isRunning && !hasMatchStarted) {
      setHasMatchStarted(true);
      snapshotNames();
      setStartedAt(new Date().toISOString());
    }
  };

  const handleReset = () => {
    setPlayer1Score(0);
    setPlayer2Score(0);
    setHasMatchStarted(false);
    setWinner(null);
    setIsTimerRunning(false);
    setBlueNameSnap(null);
    setRedNameSnap(null);
    setStartedAt(null);
    setSaved(false);
    setTimerResetId((id) => id + 1);
  };

  const handleSave = async () => {
    if (!namedBout || selection.status !== "ok" || selection.mode !== "named") return;
    if (!user || isTimerRunning || saved || saving) return;

    setSaving(true);
    const { blueResult, redResult } = scoreResults(player1Score, player2Score);
    const payload = {
      id: newMatchId(),
      clubId: user.id,
      blueFencerId: selection.blueId,
      redFencerId: selection.redId,
      blueName,
      redName,
      blueScore: player1Score,
      redScore: player2Score,
      blueResult,
      redResult,
      timeLimitSec: settings.timeLimit,
      pointsLimit: settings.pointsLimit,
      remainingSec,
      startedAt: startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    try {
      if (!navigator.onLine) {
        enqueueMatchOutbox(user.id, payload);
        setSaved(true);
        toast.message("Saved on this device. Will upload when you're online.");
        return;
      }
      await saveMatch(payload);
      await queryClient.invalidateQueries({ queryKey: [...MATCHES_QUERY_KEY, user.id] });
      setSaved(true);
      toast.success(blueResult === "draw" ? "Draw saved" : "Victory saved");
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueMatchOutbox(user.id, payload);
        setSaved(true);
        toast.message("Saved on this device. Will upload when you're online.");
        return;
      }
      toast.error(fencerErrorMessage(error, "Could not save the bout."));
    } finally {
      setSaving(false);
    }
  };

  useKeepAwake(isTimerRunning || (hasMatchStarted && !saved));

  const winnerLabel = winner === 1 ? blueName : winner === 2 ? redName : null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-end gap-2 mb-3">
            {guestScoreboard ? (
              <Button variant="outline" onClick={() => exitGuestBout()}>
                Sign in
              </Button>
            ) : (
              <>
                <Link to="/fencers">
                  <Button variant="outline" size="icon" aria-label="Fencers">
                    <Users className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/history">
                  <Button variant="outline" size="icon" aria-label="History">
                    <HistoryIcon className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/stats">
                  <Button variant="outline" size="icon" aria-label="Stats">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
            <Link to="/settings">
              <Button variant="outline" size="icon" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-display font-bold text-primary text-center">
            Fencing Scorer
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-4 md:gap-8 max-w-4xl mx-auto mb-8">
          <ScoreDisplay
            playerName={blueName}
            nameControl={
              guestScoreboard ? undefined : (
                <FencerPicker
                  fencers={active}
                  value={blueFencerId}
                  excludeId={redFencerId}
                  disabled={namesLocked}
                  placeholder="Anonymous"
                  lockedName={blueName}
                  onChange={setBlueFencerId}
                />
              )
            }
            score={player1Score}
            onIncrement={incrementPlayer1}
            onDecrement={decrementPlayer1}
            disabled={isTimerRunning}
            colorScheme="blue"
          />

          <ScoreDisplay
            playerName={redName}
            nameControl={
              guestScoreboard ? undefined : (
                <FencerPicker
                  fencers={active}
                  value={redFencerId}
                  excludeId={blueFencerId}
                  disabled={namesLocked}
                  placeholder="Anonymous"
                  lockedName={redName}
                  onChange={setRedFencerId}
                />
              )
            }
            score={player2Score}
            onIncrement={incrementPlayer2}
            onDecrement={decrementPlayer2}
            disabled={isTimerRunning}
            colorScheme="red"
          />
        </div>

        <div className="flex justify-center mb-4">
          <Timer
            key={`timer-${timerResetId}-${settings.timeLimit}`}
            initialMinutes={settings.timeLimit / 60}
            canStart={canStartTimer}
            onStateChange={handleTimerStateChange}
            onRemainingChange={setRemainingSec}
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mt-4">
          {guestScoreboard ? null : (
            <SaveResultButton
              anonymous={!namedBout}
              timerRunning={isTimerRunning}
              scoreLeader={scoreLeader(player1Score, player2Score)}
              saved={saved}
              saving={saving}
              onSave={() => void handleSave()}
            />
          )}
          <HoldResetButton disabled={isTimerRunning} onReset={handleReset} />
        </div>

        <div className="text-center mt-4 space-y-1">
          {guestScoreboard ? (
            <div className="text-sm text-muted-foreground">
              Quick bout — results are not saved.
            </div>
          ) : selectionHint ? (
            <div className="text-sm text-destructive">{selectionHint}</div>
          ) : null}
          <div className="text-sm text-muted-foreground">
            {winnerLabel
              ? `${winnerLabel} won — timer stays paused`
              : `First to ${settings.pointsLimit} points wins`}
          </div>
          {guestScoreboard || pendingUploads === 0 ? null : (
            <div className="text-sm text-muted-foreground">
              {pendingUploads === 1
                ? "1 bout will upload when you're online."
                : `${pendingUploads} bouts will upload when you're online.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function fencerName(roster: Fencer[], id: string | null, fallback: string): string {
  if (!id) return fallback;
  return roster.find((fencer) => fencer.id === id)?.name ?? fallback;
}

export default Index;
