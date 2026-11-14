import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useRevalidator } from "react-router";
import { z } from "zod";
import {
  KnockFeedProvider,
  KnockProvider,
  NotificationFeedPopover,
  NotificationIconButton,
  useKnockFeed,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";
import type { KnockFeedConfig } from "~/lib/knock-feed.server";

/** Refresh the user token this long before it expires. */
const TOKEN_REFRESH_LEAD_MS = 5 * 60 * 1000;

/** The feed channel id, once Knock is live in the browser. Null means no bell. */
const FeedChannelContext = createContext<string | null>(null);

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * The one Knock client for the app layout. It stays idle on the server and
 * until hydration, and whenever there is no Knock config or no signed-in user.
 * Users are identified inline on trigger, server-side, so the browser skips
 * identification. The user token is refreshed by revalidating the layout
 * loader, which signs a new one.
 */
export function NotificationsProvider({
  config,
  userId,
  children,
}: {
  config: KnockFeedConfig | null;
  userId: number | null;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  const enabled = hydrated && config !== null && userId !== null;

  const revalidator = useRevalidator();
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;
  // Stable, so KnockProvider doesn't re-authenticate on every render. Returns
  // nothing: the new token arrives as a prop and KnockProvider re-authenticates.
  const refreshToken = useCallback(async () => {
    await revalidatorRef.current.revalidate();
  }, []);

  return (
    <KnockProvider
      apiKey={config?.publicApiKey}
      user={{ id: userId === null ? "signed-out" : String(userId) }}
      userToken={config?.userToken ?? undefined}
      identificationStrategy="skip"
      onUserTokenExpiring={refreshToken}
      timeBeforeExpirationInMs={TOKEN_REFRESH_LEAD_MS}
      enabled={enabled}
    >
      <FeedChannelContext.Provider
        value={enabled && config ? config.feedChannelId : null}
      >
        {children}
      </FeedChannelContext.Provider>
    </KnockProvider>
  );
}

/** Follows the `dark` class Cadence's theme toggle puts on <html>. */
function useColorMode(): "light" | "dark" {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark ? "dark" : "light";
}

/**
 * The bell in the sidebar header. Renders nothing before hydration or when
 * there is no Knock config.
 */
export function NotificationBell() {
  const feedChannelId = useContext(FeedChannelContext);
  const colorMode = useColorMode();
  if (feedChannelId === null) return null;

  return (
    <KnockFeedProvider feedId={feedChannelId} colorMode={colorMode}>
      <BellAndPopover />
    </KnockFeedProvider>
  );
}

const notificationDataSchema = z.object({ url: z.string().startsWith("/") });

function BellAndPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { feedClient } = useKnockFeed();

  return (
    <>
      <NotificationIconButton
        ref={buttonRef}
        onClick={() => setIsOpen((open) => !open)}
      />
      <NotificationFeedPopover
        buttonRef={buttonRef}
        isVisible={isOpen}
        onClose={() => setIsOpen(false)}
        placement="right-start"
        // Mark read, then navigate inside Cadence instead of Knock's
        // default full-page redirect.
        onNotificationClick={(item) => {
          void feedClient.markAsRead(item);
          const parsed = notificationDataSchema.safeParse(item.data);
          if (!parsed.success) return;
          setIsOpen(false);
          navigate(parsed.data.url);
        }}
      />
    </>
  );
}
