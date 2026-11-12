// PROTOTYPE, throwaway. Floating bar: cycles ?variant= and sends sample
// Notifications to the current user.
import { useEffect } from "react";
import { useFetcher, useNavigate, useSearchParams, useLocation } from "react-router";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { SAMPLE_NOTIFICATIONS, type SampleKind } from "./samples";

export const VARIANTS = [
  { key: "A", name: "Knock prebuilt bell + popover" },
  { key: "B", name: "Custom bell, toasts, unread badge" },
  { key: "C", name: "Inbox page, refresh on navigation" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export function useVariant(): VariantKey {
  const [params] = useSearchParams();
  const v = params.get("variant");
  return VARIANTS.some((x) => x.key === v) ? (v as VariantKey) : "A";
}

/** Keeps ?variant= on links so navigating doesn't reset the variant. */
export function withVariant(to: string, variant: VariantKey) {
  return `${to}${to.includes("?") ? "&" : "?"}variant=${variant}`;
}

let lastVariant: string | null = null;

export function PrototypeSwitcher() {
  const variant = useVariant();
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher<{ ok?: string; error?: string }>();
  const index = VARIANTS.findIndex((v) => v.key === variant);

  function go(delta: number) {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
    const params = new URLSearchParams(location.search);
    params.set("variant", next.key);
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }

  // Plain links drop ?variant=; put the last chosen one back after navigating.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("variant")) {
      lastVariant = params.get("variant");
    } else if (lastVariant) {
      params.set("variant", lastVariant);
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-1">
      {fetcher.data && (
        <div
          className={`max-w-xl rounded-md px-3 py-1 text-xs shadow ${fetcher.data.error ? "bg-red-600 text-white" : "bg-zinc-800 text-white"}`}
        >
          {fetcher.data.error ?? fetcher.data.ok}
        </div>
      )}
      <div className="flex items-center gap-2 rounded-full bg-fuchsia-600 px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-white/60">
        <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20" title="Previous (←)">
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-semibold">
          {variant} <span className="font-normal opacity-80">({VARIANTS[index].name})</span>
        </span>
        <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20" title="Next (→)">
          <ChevronRight className="size-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/40" />
        <Send className="size-3.5 opacity-80" />
        {(Object.keys(SAMPLE_NOTIFICATIONS) as SampleKind[]).map((kind) => (
          <fetcher.Form key={kind} method="post" action="/api/prototype-notify">
            <button
              name="kind"
              value={kind}
              disabled={fetcher.state !== "idle"}
              className="rounded-full bg-white/15 px-2 py-0.5 text-xs hover:bg-white/30 disabled:opacity-50"
            >
              {SAMPLE_NOTIFICATIONS[kind].label}
            </button>
          </fetcher.Form>
        ))}
      </div>
    </div>
  );
}
