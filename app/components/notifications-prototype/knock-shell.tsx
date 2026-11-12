// PROTOTYPE, throwaway. One KnockProvider around the app layout, kept idle
// (enabled=false) on the server and until hydration, per research ticket #8.
// Variants read useKnockReady() and render nothing until it's true.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { KnockProvider } from "@knocklabs/react";
import type { KnockPrototypeConfig } from "~/lib/knock-prototype.server";

type Ready = { ready: false } | { ready: true; feedChannelId: string };
const ReadyContext = createContext<Ready>({ ready: false });
export const useKnockReady = () => useContext(ReadyContext);

export function KnockShell({
  config,
  user,
  children,
}: {
  config: KnockPrototypeConfig | null;
  user: { id: number; name: string } | null;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const enabled = mounted && !!config && !!user;

  return (
    <KnockProvider
      apiKey={config?.publicApiKey}
      user={{ id: String(user?.id ?? "anonymous"), name: user?.name }}
      userToken={config?.userToken ?? undefined}
      // Users are identified inline on trigger, server-side (ticket #10).
      identificationStrategy="skip"
      enabled={enabled}
    >
      <ReadyContext.Provider
        value={enabled ? { ready: true, feedChannelId: config!.feedChannelId } : { ready: false }}
      >
        {children}
      </ReadyContext.Provider>
    </KnockProvider>
  );
}

export function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
