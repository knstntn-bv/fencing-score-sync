import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Settings, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ClubNav } from "@/components/ClubNav";
import { TournamentScoreboardBar } from "@/components/TournamentScoreboardBar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  TOURNAMENT_BOUTS_QUERY_KEY,
  TOURNAMENT_QUERY_KEY,
  useTournament,
  useTournamentSlot,
} from "@/hooks/useTournament";
import { useTournaments } from "@/hooks/useTournaments";
import { useMatchOutboxCount } from "@/hooks/useMatchOutbox";
import { enqueueMatchOutbox } from "@/lib/matchOutbox";
import { newMatchId, saveMatch } from "@/lib/matches";
import { isNetworkError } from "@/lib/networkError";
import { insertKothBout, saveTournamentBout } from "@/lib/tournamentBouts";
import { kothChallengerIds } from "@/lib/tournament/kingOfHill";
import { playoffOverrideBlock } from "@/lib/tournament/override";
import { tournamentErrorMessage } from "@/lib/tournaments";

interface IndexProps {
  settings: {
    timeLimit: number;
    pointsLimit: number;
  };
}

const Index = ({ settings }: IndexProps) => {
  const { user, clubId, guestBout, exitGuestBout } = useAuth();
  const guestScoreboard = guestBout && !user;
  const signedInWithoutClub = Boolean(user && !clubId);
  const localOnlyBoard = guestScoreboard || signedInWithoutClub;
  const showClubChrome = !localOnlyBoard;
  const { active } = useFencers();
  const queryClient = useQueryClient();
  const pendingUploads = useMatchOutboxCount(clubId ?? undefined);
  const [params] = useSearchParams();
  const tournamentId = params.get("t");
  const boutId = params.get("b");
  const event = useTournament(tournamentId ?? undefined);
  const slot = useTournamentSlot(tournamentId, boutId);
  const tournaments = useTournaments();
  const hasOpenTournament = tournaments.tournaments.some((row) => row.status !== "done");
  const tournamentSlot = Boolean(tournamentId && boutId) && !localOnlyBoard;
  const kothBoard =
    Boolean(tournamentId) &&
    !boutId &&
    (slot.tournament ?? event.tournament)?.format === "king_of_hill" &&
    !localOnlyBoard;
  const boardTournament = slot.tournament ?? event.tournament;
  const timeLimit = boardTournament?.timeLimitSec ?? settings.timeLimit;
  const pointsLimit = boardTournament?.pointsLimit ?? settings.pointsLimit;
  const slotBoutId = slot.bout?.id ?? null;
  const slotFinishedAt = slot.bout?.finishedAt ?? null;
  const eventLive = boardTournament?.status === "live";
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
  const [playoffDrawOpen, setPlayoffDrawOpen] = useState(false);
  const hydratedSlotKey = useRef<string | null>(null);

  const selection = resolveBoutSelection(blueFencerId, redFencerId);
  const kothHint =
    Boolean(tournamentId) && !boutId && boardTournament && !kothBoard
      ? "Start a bout from the event queue."
      : kothBoard && boardTournament?.status !== "live"
        ? "This event is not in progress."
        : null;
  const selectionHint = tournamentSlot ? null : kothHint ?? boutSelectionMessage(selection);
  const namedBout = tournamentSlot
    ? Boolean(slot.bout?.blueFencerId && slot.bout?.redFencerId)
    : kothBoard
      ? !localOnlyBoard && selection.status === "ok" && selection.mode === "named"
      : !localOnlyBoard &&
        !tournamentId &&
        selection.status === "ok" &&
        selection.mode === "named";
  const canStartTimer = tournamentSlot
    ? namedBout && eventLive && !winner && !slotFinishedAt
    : kothBoard
      ? namedBout && eventLive && !winner && !saved
      : !tournamentId && selection.status === "ok" && !winner;
  const namesLocked =
    hasMatchStarted || winner !== null || Boolean(slot.bout) || (kothBoard && saved);

  const kothFencers = event.participants.map((row) => ({
    id: row.fencerId,
    name: row.name,
  }));
  const kothKingId = event.kothExits.find((row) => row.isKing)?.fencerId ?? null;
  const challengerIds = kothChallengerIds(event.kothExits);
  const kothChallengers = kothFencers.filter(
    (fencer) => challengerIds.has(fencer.id) || fencer.id === redFencerId
  );
  const slotFencers = event.participants.map((row) => ({
    id: row.fencerId,
    name: row.name,
  }));
  const pickerFencers = kothBoard ? kothFencers : tournamentSlot ? slotFencers : active;
  const redPickerFencers = kothBoard ? kothChallengers : pickerFencers;

  const liveBlueName = fencerName(pickerFencers, blueFencerId, "Fencer 1");
  const liveRedName = fencerName(pickerFencers, redFencerId, "Fencer 2");
  const blueName = namesLocked ? (blueNameSnap ?? liveBlueName) : liveBlueName;
  const redName = namesLocked ? (redNameSnap ?? liveRedName) : liveRedName;

  const applyScores = (blueScore: number, redScore: number) => {
    setPlayer1Score(blueScore);
    setPlayer2Score(redScore);
    setWinner((current) => nextWinnerState(current, blueScore, redScore, pointsLimit));
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

  useEffect(() => {
    if (!tournamentSlot || !slotBoutId || !slot.bout) {
      hydratedSlotKey.current = null;
      return;
    }
    const key = `${slotBoutId}:${slotFinishedAt ?? ""}`;
    if (hydratedSlotKey.current === key) return;
    hydratedSlotKey.current = key;
    setBlueFencerId(slot.bout.blueFencerId);
    setRedFencerId(slot.bout.redFencerId);
    setIsTimerRunning(false);
    setWinner(null);
    setStartedAt(null);
    setTimerResetId((id) => id + 1);
    setRemainingSec(slot.tournament?.timeLimitSec ?? settings.timeLimit);
    if (slot.bout.finishedAt) {
      setPlayer1Score(slot.bout.blueScore ?? 0);
      setPlayer2Score(slot.bout.redScore ?? 0);
      setSaved(true);
      setBlueNameSnap(slot.bout.blueName);
      setRedNameSnap(slot.bout.redName);
      setHasMatchStarted(true);
    } else {
      setPlayer1Score(0);
      setPlayer2Score(0);
      setSaved(false);
      setBlueNameSnap(null);
      setRedNameSnap(null);
      setHasMatchStarted(false);
    }
  }, [tournamentSlot, slotBoutId, slotFinishedAt, slot.bout, slot.tournament?.timeLimitSec, settings.timeLimit]);

  useEffect(() => {
    if (!kothBoard || namesLocked) return;
    if (!kothKingId) return;
    setBlueFencerId((current) => current ?? kothKingId);
  }, [kothBoard, kothKingId, namesLocked]);

  const handleReset = () => {
    if (slot.bout?.finishedAt) return;
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
    if (kothBoard) {
      if (kothKingId) {
        setBlueFencerId(kothKingId);
        setRedFencerId(null);
      }
    }
  };

  const handleSave = async () => {
    if (!namedBout || isTimerRunning || saved || saving) return;
    if (!user || !clubId) return;

    if (kothBoard) {
      if (!boardTournament || boardTournament.status !== "live") {
        toast.error("This event is not in progress.");
        return;
      }
      if (selection.status !== "ok" || selection.mode !== "named") return;
      if (!navigator.onLine) {
        toast.error("Need a network connection to save a tournament bout.");
        return;
      }
      setSaving(true);
      const { blueResult, redResult } = scoreResults(player1Score, player2Score);
      try {
        await insertKothBout({
          tournamentId: boardTournament.id,
          clubId,
          blueFencerId: selection.blueId,
          redFencerId: selection.redId,
          blueName,
          redName,
          blueScore: player1Score,
          redScore: player2Score,
          blueResult,
          redResult,
          timeLimitSec: timeLimit,
          pointsLimit,
          remainingSec,
          startedAt: startedAt ?? new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        await queryClient.invalidateQueries({
          queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, boardTournament.id],
        });
        await queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_QUERY_KEY, boardTournament.id] });
        setSaved(true);
        toast.success(blueResult === "draw" ? "Draw saved" : "Victory saved");
      } catch (error) {
        toast.error(
          isNetworkError(error)
            ? "Need a network connection to save a tournament bout."
            : tournamentErrorMessage(error, "Could not save the bout.")
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    if (tournamentId && !tournamentSlot) return;

    if (tournamentSlot) {
      if (!slot.bout || !slot.tournament || !slot.bout.blueFencerId || !slot.bout.redFencerId) return;
      if (slot.tournament.status !== "live") {
        toast.error("This event is not in progress.");
        return;
      }
      if (slot.bout.finishedAt) return;
      const blocked = playoffOverrideBlock(slot.bout.stage, player1Score, player2Score);
      if (blocked) {
        setPlayoffDrawOpen(true);
        return;
      }
      if (!navigator.onLine) {
        toast.error("Need a network connection to save a tournament bout.");
        return;
      }
      setSaving(true);
      const { blueResult, redResult } = scoreResults(player1Score, player2Score);
      try {
        await saveTournamentBout({
          id: slot.bout.id,
          blueFencerId: slot.bout.blueFencerId,
          redFencerId: slot.bout.redFencerId,
          blueName,
          redName,
          blueScore: player1Score,
          redScore: player2Score,
          blueResult,
          redResult,
          timeLimitSec: timeLimit,
          pointsLimit,
          remainingSec,
          startedAt: startedAt ?? new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        await queryClient.invalidateQueries({
          queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, slot.tournament.id],
        });
        await queryClient.invalidateQueries({
          queryKey: [...TOURNAMENT_BOUTS_QUERY_KEY, "slot", slot.bout.id],
        });
        await queryClient.invalidateQueries({ queryKey: [...TOURNAMENT_QUERY_KEY, slot.tournament.id] });
        setSaved(true);
        toast.success(blueResult === "draw" ? "Draw saved" : "Victory saved");
      } catch (error) {
        toast.error(
          isNetworkError(error)
            ? "Need a network connection to save a tournament bout."
            : tournamentErrorMessage(error, "Could not save the bout.")
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    if (selection.status !== "ok" || selection.mode !== "named") return;

    setSaving(true);
    const { blueResult, redResult } = scoreResults(player1Score, player2Score);
    const payload = {
      id: newMatchId(),
      clubId,
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
        enqueueMatchOutbox(clubId, payload);
        setSaved(true);
        toast.message("Saved on this device. Will upload when you're online.");
        return;
      }
      await saveMatch(payload);
      await queryClient.invalidateQueries({ queryKey: [...MATCHES_QUERY_KEY, clubId] });
      setSaved(true);
      toast.success(blueResult === "draw" ? "Draw saved" : "Victory saved");
    } catch (error) {
      if (isNetworkError(error)) {
        enqueueMatchOutbox(clubId, payload);
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
          <div className="flex items-center gap-2 mb-3">
            {!showClubChrome ? null : tournamentId ? (
              <Button asChild variant="outline" size="icon" aria-label="Back to event">
                <Link to={`/tournaments/${tournamentId}`}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label={hasOpenTournament ? "Tournaments, event in progress" : "Tournaments"}
                className={hasOpenTournament ? "border-primary text-primary hover:text-primary" : undefined}
              >
                <Link to="/tournaments">
                  <Trophy className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <div className="flex justify-end gap-2 ml-auto">
              {guestScoreboard ? (
                <Button variant="outline" onClick={() => exitGuestBout()}>
                  Sign in
                </Button>
              ) : showClubChrome ? (
                <ClubNav exclude={["/tournaments"]} />
              ) : null}
              <Link to="/settings">
                <Button variant="outline" size="icon" aria-label="Settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-primary text-center">
            Fencing Scorer
          </h1>
          {boardTournament ? (
            <div className="mt-4">
              <TournamentScoreboardBar name={boardTournament.name} />
            </div>
          ) : null}
          {tournamentSlot && slot.notFound ? (
            <p className="text-sm text-destructive text-center mt-2">
              This tournament bout was not found.
            </p>
          ) : null}
          {!boutId && slot.notFound ? (
            <p className="text-sm text-destructive text-center mt-2">
              This tournament was not found.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 md:gap-8 max-w-4xl mx-auto mb-8">
          <ScoreDisplay
            playerName={blueName}
            nameControl={
              localOnlyBoard ? undefined : (
                <FencerPicker
                  fencers={pickerFencers}
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
              localOnlyBoard ? undefined : (
                <FencerPicker
                  fencers={redPickerFencers}
                  value={redFencerId}
                  excludeId={blueFencerId}
                  disabled={namesLocked}
                  placeholder={kothBoard ? "Challenger" : "Anonymous"}
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
            key={`timer-${timerResetId}-${timeLimit}-${slot.bout?.id ?? (kothBoard ? "koth" : "club")}`}
            initialMinutes={timeLimit / 60}
            canStart={canStartTimer}
            onStateChange={handleTimerStateChange}
            onRemainingChange={setRemainingSec}
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mt-4">
          {localOnlyBoard ? null : (
            <SaveResultButton
              anonymous={!namedBout}
              timerRunning={isTimerRunning}
              scoreLeader={scoreLeader(player1Score, player2Score)}
              saved={saved}
              saving={saving}
              onSave={() => void handleSave()}
            />
          )}
          <HoldResetButton disabled={isTimerRunning || Boolean(slot.bout?.finishedAt)} onReset={handleReset} />
        </div>

        <div className="text-center mt-4 space-y-1">
          {guestScoreboard ? (
            <div className="text-sm text-muted-foreground">
              Quick bout — results are not saved.
            </div>
          ) : signedInWithoutClub ? (
            <div className="text-sm text-muted-foreground">
              Results are not saved until you create a club in Account.
            </div>
          ) : selectionHint ? (
            <div className="text-sm text-destructive">{selectionHint}</div>
          ) : null}
          <div className="text-sm text-muted-foreground">
            {winnerLabel
              ? `${winnerLabel} won — timer stays paused`
              : `First to ${pointsLimit} points wins`}
          </div>
          {localOnlyBoard || tournamentSlot || kothBoard || pendingUploads === 0 ? null : (
            <div className="text-sm text-muted-foreground">
              {pendingUploads === 1
                ? "1 bout will upload when you're online."
                : `${pendingUploads} bouts will upload when you're online.`}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={playoffDrawOpen} onOpenChange={setPlayoffDrawOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Playoff bouts need a winner</AlertDialogTitle>
            <AlertDialogDescription>
              Equal scores cannot be saved. Fence to a deciding touch, then save the victory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function fencerName(roster: { id: string; name: string }[], id: string | null, fallback: string): string {
  if (!id) return fallback;
  return roster.find((fencer) => fencer.id === id)?.name ?? fallback;
}

export default Index;
