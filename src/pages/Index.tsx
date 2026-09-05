import { useState } from "react";
import { Link } from "react-router-dom";
import { Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import ScoreDisplay from "@/components/ScoreDisplay";
import Timer from "@/components/Timer";
import MatchControls from "@/components/MatchControls";
import FencerPicker from "@/components/FencerPicker";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useFencers } from "@/hooks/useFencers";
import { boutSelectionMessage, resolveBoutSelection } from "@/lib/boutSelection";
import type { Fencer } from "@/types/fencing";

interface IndexProps {
  settings: {
    timeLimit: number;
    pointsLimit: number;
  };
}

const Index = ({ settings }: IndexProps) => {
  const { active } = useFencers();
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [hasMatchStarted, setHasMatchStarted] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [timerResetId, setTimerResetId] = useState(0);
  const [blueFencerId, setBlueFencerId] = useState<string | null>(null);
  const [redFencerId, setRedFencerId] = useState<string | null>(null);
  const [blueNameSnap, setBlueNameSnap] = useState<string | null>(null);
  const [redNameSnap, setRedNameSnap] = useState<string | null>(null);

  const selection = resolveBoutSelection(blueFencerId, redFencerId);
  const selectionHint = boutSelectionMessage(selection);
  const canStart = selection.status === "ok";

  const blueName = hasMatchStarted
    ? (blueNameSnap ?? fencerName(active, blueFencerId, "Fencer 1"))
    : fencerName(active, blueFencerId, "Fencer 1");
  const redName = hasMatchStarted
    ? (redNameSnap ?? fencerName(active, redFencerId, "Fencer 2"))
    : fencerName(active, redFencerId, "Fencer 2");

  const checkWinCondition = (p1Score: number, p2Score: number) => {
    if (p1Score >= settings.pointsLimit && p2Score < settings.pointsLimit) {
      setWinner(1);
    } else if (p2Score >= settings.pointsLimit && p1Score < settings.pointsLimit) {
      setWinner(2);
    } else if (p1Score < settings.pointsLimit && p2Score < settings.pointsLimit) {
      setWinner(null);
    }
  };

  const incrementPlayer1 = () => {
    const newScore = player1Score + 1;
    setPlayer1Score(newScore);
    checkWinCondition(newScore, player2Score);
  };
  
  const decrementPlayer1 = () => {
    const newScore = Math.max(0, player1Score - 1);
    setPlayer1Score(newScore);
    checkWinCondition(newScore, player2Score);
  };
  
  const incrementPlayer2 = () => {
    const newScore = player2Score + 1;
    setPlayer2Score(newScore);
    checkWinCondition(player1Score, newScore);
  };
  
  const decrementPlayer2 = () => {
    const newScore = Math.max(0, player2Score - 1);
    setPlayer2Score(newScore);
    checkWinCondition(player1Score, newScore);
  };

  const handleTimerStateChange = (isRunning: boolean) => {
    setIsTimerRunning(isRunning);
    if (isRunning && !hasMatchStarted) {
      setHasMatchStarted(true);
      setBlueNameSnap(fencerName(active, blueFencerId, "Fencer 1"));
      setRedNameSnap(fencerName(active, redFencerId, "Fencer 2"));
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
    setTimerResetId((id) => id + 1);
  };

  // Keep screen awake during matches
  useKeepAwake(hasMatchStarted && !winner);

  const winnerLabel =
    winner === 1 ? blueName : winner === 2 ? redName : null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 relative">
          <div className="absolute right-0 top-0 flex gap-2">
            <Link to="/fencers">
              <Button variant="outline" size="icon" aria-label="Fencers">
                <Users className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" size="icon" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-display font-bold text-primary mb-2">
            Fencing Scorer
          </h1>
        </div>

        {/* Score Displays */}
        <div className="grid grid-cols-2 gap-4 md:gap-8 max-w-4xl mx-auto mb-8">
          <ScoreDisplay
            playerName={blueName}
            nameControl={
              <FencerPicker
                fencers={active}
                value={blueFencerId}
                excludeId={redFencerId}
                disabled={hasMatchStarted}
                placeholder="Anonymous"
                lockedName={blueName}
                onChange={setBlueFencerId}
              />
            }
            score={player1Score}
            onIncrement={incrementPlayer1}
            onDecrement={decrementPlayer1}
            disabled={isTimerRunning || winner !== null}
            colorScheme="blue"
          />
          
          <ScoreDisplay
            playerName={redName}
            nameControl={
              <FencerPicker
                fencers={active}
                value={redFencerId}
                excludeId={blueFencerId}
                disabled={hasMatchStarted}
                placeholder="Anonymous"
                lockedName={redName}
                onChange={setRedFencerId}
              />
            }
            score={player2Score}
            onIncrement={incrementPlayer2}
            onDecrement={decrementPlayer2}
            disabled={isTimerRunning || winner !== null}
            colorScheme="red"
          />
        </div>

        {/* Timer */}
        <div className="flex justify-center mb-4">
          <Timer
            key={`timer-${timerResetId}-${settings.timeLimit}`}
            initialMinutes={settings.timeLimit / 60} 
            canStart={canStart}
            onStateChange={handleTimerStateChange}
          />
        </div>

        {/* Match Controls */}
        <MatchControls onReset={handleReset} />

        {/* Match Status */}
        <div className="text-center mt-4 space-y-1">
          {selectionHint ? (
            <div className="text-sm text-destructive">{selectionHint}</div>
          ) : null}
          <div className="text-sm text-muted-foreground">
            {winnerLabel
              ? `${winnerLabel} won!`
              : `First to ${settings.pointsLimit} points wins`}
          </div>
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
