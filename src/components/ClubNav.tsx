import type { LucideIcon } from "lucide-react";
import { ArrowLeft, BarChart3, History as HistoryIcon, Trophy, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/fencers", label: "Fencers", icon: Users },
  { to: "/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/history", label: "History", icon: HistoryIcon },
  { to: "/stats", label: "Stats", icon: BarChart3 },
];

export function ClubNav({ className }: { className?: string }) {
  const { pathname } = useLocation();

  return (
    <nav className={cn("flex flex-wrap justify-end gap-2", className)} aria-label="Club">
      {LINKS.map((item) => {
        const Icon = item.icon;
        const current = pathname === item.to;
        return (
          <Button
            key={item.to}
            asChild
            variant={current ? "secondary" : "outline"}
            size="icon"
            aria-label={item.label}
            aria-current={current ? "page" : undefined}
          >
            <Link to={item.to}>
              <Icon className="h-4 w-4" />
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function ClubPageHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-start gap-4">
        <Link to="/" className="shrink-0">
          <Button variant="outline" size="icon" aria-label="Back to scoreboard">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-display font-bold text-primary flex items-center gap-2">
                <Icon className="h-7 w-7 shrink-0" />
                {title}
              </h1>
              <p className="text-muted-foreground">{subtitle}</p>
            </div>
            <ClubNav className="hidden sm:flex shrink-0" />
          </div>
          <ClubNav className="flex sm:hidden mt-3" />
        </div>
      </div>
    </div>
  );
}
