import { useState, useEffect, useRef } from "react";
import { createCountdownController } from "@/lib/countdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause } from "lucide-react";

interface TimerProps {
  initialMinutes?: number;
  canStart?: boolean;
  onStateChange?: (isRunning: boolean) => void;
  onRemainingChange?: (seconds: number) => void;
}

export default function Timer({
  initialMinutes = 3,
  canStart = true,
  onStateChange,
  onRemainingChange,
}: TimerProps) {
  const [durationMs] = useState(() => Math.round(initialMinutes * 60 * 1000));
  const [timeLeft, setTimeLeft] = useState(() => Math.ceil(durationMs / 1000));
  const [isRunning, setIsRunning] = useState(false);
  const callbacks = useRef({ onStateChange, onRemainingChange });
  const controller = useRef<ReturnType<typeof createCountdownController> | null>(null);

  useEffect(() => {
    callbacks.current = { onStateChange, onRemainingChange };
  }, [onStateChange, onRemainingChange]);

  useEffect(() => {
    const next = createCountdownController(durationMs, {
      now: () => performance.now(),
      every: (callback, milliseconds) => {
        const interval = window.setInterval(callback, milliseconds);
        return () => window.clearInterval(interval);
      },
      onVisible: callback => {
        const onVisibilityChange = () => {
          if (document.visibilityState === "visible") callback();
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => document.removeEventListener("visibilitychange", onVisibilityChange);
      },
    }, {
      remaining: seconds => {
        setTimeLeft(seconds);
        callbacks.current.onRemainingChange?.(seconds);
      },
      running: running => {
        setIsRunning(running);
        callbacks.current.onStateChange?.(running);
      },
    });
    controller.current = next;
    return () => {
      next.dispose();
      controller.current = null;
    };
  }, [durationMs]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (isRunning) controller.current?.pause();
    else if (canStart && timeLeft > 0) controller.current?.start();
  };


  const timerColor = timeLeft <= 10 ? "text-destructive" : "text-timer-fg";

  return (
    <div className="flex flex-col items-center">
      <Card className={`p-6 flex flex-col items-center space-y-4 transition-all duration-300 border-2 ${
        isRunning 
          ? 'bg-background/90 border-primary shadow-lg shadow-primary/20' 
          : 'bg-timer-bg border-primary/50'
      }`}>
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
          disabled={!isRunning && (!canStart || timeLeft === 0)}
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
