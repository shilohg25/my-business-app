import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resettableFilterButtonLabel } from "@/lib/utils/filters";

interface ResetFiltersButtonProps {
  onClick: () => void;
  disabled?: boolean;
  visible?: boolean;
  className?: string;
}

export function ResetFiltersButton({ onClick, disabled, visible = true, className }: ResetFiltersButtonProps) {
  if (!visible) {
    return null;
  }

  return (
    <Button className={cn("shrink-0", className)} disabled={disabled} onClick={onClick} type="button" variant="outline">
      {resettableFilterButtonLabel}
    </Button>
  );
}
