import {
  BookOpen,
  GraduationCap,
  LayoutGrid,
  type LucideIcon,
  PlayCircle,
} from "lucide-react";
import type { CatalogueStats as Stats } from "~/modules/landing/index.server";

type Stat = { icon: LucideIcon; value: number; label: string };

export function CatalogueStats({ stats }: { stats: Stats }) {
  const items: Stat[] = [
    { icon: BookOpen, value: stats.courses, label: "Published courses" },
    {
      icon: PlayCircle,
      value: stats.lessons,
      label: "Lessons to work through",
    },
    { icon: GraduationCap, value: stats.instructors, label: "Instructors" },
    { icon: LayoutGrid, value: stats.categories, label: "Categories" },
  ];

  return (
    <section className="border-y border-border bg-muted/50 py-12">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 lg:grid-cols-4">
        {items.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <div>
              <dd className="text-3xl font-bold tracking-tight">{value}</dd>
              <dt className="text-sm text-muted-foreground">{label}</dt>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
