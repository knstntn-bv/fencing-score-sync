import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface MatchControlsProps {
  onReset: () => void;
}

export default function MatchControls({ onReset }: MatchControlsProps) {
  const handleReset = () => {
    console.log("Reset button clicked");
    onReset();
  };

  return (
    <div className="flex justify-center mt-4">
      <Button 
        variant="control" 
        onClick={handleReset}
        className="flex items-center space-x-2"
      >
        <RotateCcw className="h-4 w-4" />
        <span>Reset Match</span>
      </Button>
    </div>
  );
}