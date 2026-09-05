import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause } from "lucide-react";

interface TimerProps {
  initialMinutes?: number;
  canStart?: boolean;
  onStateChange?: (isRunning: boolean) => void;
}

export default function Timer({
  initialMinutes = 3,
  canStart = true,
  onStateChange,
}: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => time - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      onStateChange?.(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (!isRunning && !canStart) return;
    const newRunningState = !isRunning;
    setIsRunning(newRunningState);
    onStateChange?.(newRunningState);
  };


  const timerColor = timeLeft <= 10 ? "text-destructive" : "text-timer-fg";

  return (
    <div className="flex flex-col items-center space-y-4">
      <Card className={`p-6 flex flex-col items-center space-y-4 transition-all duration-300 border-2 ${
        isRunning 
          ? 'bg-background/90 border-primary shadow-lg shadow-primary/20' 
          : 'bg-timer-bg border-primary/50'
      }`}>
        <h3 className={`text-lg font-display font-semibold transition-colors duration-300 ${
          isRunning ? 'text-primary' : 'text-timer-fg'
        }`}>
          Match Timer
        </h3>
        
        <div className={`text-6xl font-mono font-bold transition-colors duration-300 ${
          isRunning 
            ? (timerColor === "text-destructive" ? "text-destructive" : "text-primary") 
            : timerColor
        }`}>
          {formatTime(timeLeft)}
        </div>
        
        <Button 
          variant={isRunning ? "default" : "timer"}
          size="lg"
          onClick={handleStart}
          disabled={!isRunning && !canStart}
          className={`flex items-center space-x-2 h-12 px-6 transition-all duration-300 ${
            isRunning ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''
          }`}
        >
          {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          <span className="text-base">{isRunning ? "Pause" : "Start"}</span>
        </Button>
      </Card>
    </div>
  );
}