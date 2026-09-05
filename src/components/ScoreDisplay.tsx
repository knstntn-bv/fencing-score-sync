import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Minus } from "lucide-react";

interface ScoreDisplayProps {
  playerName: string;
  nameControl?: ReactNode;
  score: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  colorScheme: "blue" | "red";
}

export default function ScoreDisplay({
  playerName,
  nameControl,
  score,
  onIncrement,
  onDecrement,
  disabled = false,
  colorScheme,
}: ScoreDisplayProps) {
  const bgColor = colorScheme === "blue" ? "bg-fencer-blue-bg" : "bg-fencer-red-bg";
  const accentColor = colorScheme === "blue" ? "border-fencer-blue" : "border-fencer-red";
  return (
    <Card className={`${bgColor} ${accentColor} border-2 p-8 flex flex-col items-center space-y-6 min-h-[300px] justify-center`}>
      {nameControl ?? (
        <h2 className="text-xl font-display font-semibold text-fencer-foreground text-center">
          {playerName}
        </h2>
      )}
      
      <div className="text-8xl font-mono font-bold text-fencer-foreground animate-pulse-score">
        {score}
      </div>
      
      <div className="flex space-x-4 h-16"> {/* Fixed height container */}
        {!disabled ? (
          <>
            <Button 
              variant="scoreboard" 
              size="lg" 
              onClick={onDecrement}
              className="h-16 w-16 rounded-full"
            >
              <Minus className="h-8 w-8" />
            </Button>
            
            <Button 
              variant="scoreboard" 
              size="lg" 
              onClick={onIncrement}
              className="h-16 w-16 rounded-full"
            >
              <Plus className="h-8 w-8" />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-center w-full h-16">
            <div className="text-sm text-fencer-foreground/60 text-center">
              Timer is running - scoring disabled
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}