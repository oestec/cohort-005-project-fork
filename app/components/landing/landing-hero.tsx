import { Link } from "react-router";
import {
  ArrowRight,
  BadgeCheck,
  Globe,
  ListChecks,
  type LucideIcon,
  Route as RouteIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";

type LandingHeroProps = {
  courseCount: number;
  lessonCount: number;
  signedIn: boolean;
};

type Feature = { icon: LucideIcon; title: string; body: string };

const FEATURES: Feature[] = [
  {
    icon: RouteIcon,
    title: "Structured paths",
    body: "Every course is split into modules and short lessons, in order.",
  },
  {
    icon: ListChecks,
    title: "Quizzes that check you",
    body: "Test what you learned with a quiz as you go, and retry until you pass.",
  },
  {
    icon: BadgeCheck,
    title: "Progress that sticks",
    body: "Pick up at the next lesson you haven't finished, on any device.",
  },
  {
    icon: Globe,
    title: "Fair pricing",
    body: "Many courses adjust their price to where you live.",
  },
];

export function LandingHero({
  courseCount,
  lessonCount,
  signedIn,
}: LandingHeroProps) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
      <HeroIntro
        courseCount={courseCount}
        lessonCount={lessonCount}
        signedIn={signedIn}
      />
      <FeatureList />
    </section>
  );
}

function HeroIntro({ courseCount, lessonCount, signedIn }: LandingHeroProps) {
  return (
    <div>
      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        {courseCount} courses · {lessonCount} lessons
      </p>
      <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
        Learn to code,
        <br />
        <span className="text-muted-foreground">at your own pace</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Structured courses built by experienced instructors. Track your
        progress, take quizzes, and build real-world skills.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link to="/courses">
            Browse Courses
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
        {signedIn ? (
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">Go to your dashboard</Link>
          </Button>
        ) : (
          <Button asChild size="lg" variant="outline">
            <Link to="/signup">Create a free account</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function FeatureList() {
  return (
    <ul className="grid gap-4 rounded-2xl border border-border bg-muted/40 p-6 sm:grid-cols-2 lg:grid-cols-1">
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <li
          key={title}
          className="flex gap-4 rounded-xl bg-background p-4 shadow-sm"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
