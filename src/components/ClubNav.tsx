import type { LucideIcon } from "lucide-react";
import { ArrowLeft, History as HistoryIcon, Trophy, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/fencers", label: "Fencers", icon: Users },
  { to: "/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/history", label: "History", icon: HistoryIcon },
];

function isCurrent(pathname: string, to: string): boolean {
  if (to === "/tournaments") {
    return pathname === "/tournaments" || pathname.startsWith("/tournaments/");
  }
  if (to === "/fencers") {
    return pathname === "/fencers" || pathname.startsWith("/fencers/");
  }
  if (to === "/history") {
    return pathname === "/history" || pathname === "/stats";
  }
  return pathname === to;
}

export function ClubNav({
  className,
  exclude = [],
}: {
  className?: string;
  exclude?: string[];
}) {
  const { pathname } = useLocation();
  const items = LINKS.filter((item) => !exclude.includes(item.to));

  return (
    <nav className={cn("flex flex-wrap justify-end gap-2", className)} aria-label="Club">
      {items.map((item) => {
        const Icon = item.icon;
        const current = isCurrent(pathname, item.to);
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
  backTo = "/",
  backLabel = "Back to scoreboard",
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-start gap-4">
        <Link to={backTo} className="shrink-0">
          <Button variant="outline" size="icon" aria-label={backLabel}>
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
