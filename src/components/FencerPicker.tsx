import { Link } from "react-router-dom";
import type { Fencer } from "@/types/fencing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ANONYMOUS_FENCER_VALUE = "anonymous";

type FencerPickerProps = {
  fencers: Fencer[];
  value: string | null;
  excludeId?: string | null;
  disabled?: boolean;
  placeholder: string;
  lockedName: string;
  onChange: (fencerId: string | null) => void;
};

export default function FencerPicker({
  fencers,
  value,
  excludeId,
  disabled = false,
  placeholder,
  lockedName,
  onChange,
}: FencerPickerProps) {
  if (disabled) {
    return (
      <h2 className="text-xl font-display font-semibold text-fencer-foreground text-center">
        {lockedName}
      </h2>
    );
  }

  const options = fencers.filter((fencer) => fencer.id !== excludeId);
  const selectValue = value ?? ANONYMOUS_FENCER_VALUE;

  return (
    <div className="w-full max-w-[220px]">
      <Select
        value={selectValue}
        onValueChange={(next) => onChange(next === ANONYMOUS_FENCER_VALUE ? null : next)}
      >
        <SelectTrigger className="h-11 bg-black/25 border-fencer-foreground/30 text-fencer-foreground">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANONYMOUS_FENCER_VALUE}>{placeholder}</SelectItem>
          {options.map((fencer) => (
            <SelectItem key={fencer.id} value={fencer.id}>
              {fencer.name}
            </SelectItem>
          ))}
          {fencers.length === 0 ? (
            <div className="px-8 py-2 text-sm text-muted-foreground">
              <Link to="/fencers" className="underline">
                Add fencers
              </Link>{" "}
              to name this bout.
            </div>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}
