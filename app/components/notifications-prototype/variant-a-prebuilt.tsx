// PROTOTYPE, throwaway. Variant A: Knock's prebuilt bell + popover, as-is.
// Realtime over the websocket. Badge counts UNSEEN; opening the popover
// marks everything seen, so the badge clears on open.
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  KnockFeedProvider,
  NotificationFeedPopover,
  NotificationIconButton,
  useKnockFeed,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";
import { useIsDark, useKnockReady } from "./knock-shell";
import type { PrototypeItemData } from "./samples";

export function VariantABell() {
  const knock = useKnockReady();
  const isDark = useIsDark();
  if (!knock.ready) return null;
  return (
    <KnockFeedProvider feedId={knock.feedChannelId} colorMode={isDark ? "dark" : "light"}>
      <Bell />
    </KnockFeedProvider>
  );
}

function Bell() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { feedClient } = useKnockFeed();

  return (
    <>
      <NotificationIconButton ref={buttonRef} onClick={() => setOpen(!open)} />
      <NotificationFeedPopover
        buttonRef={buttonRef}
        isVisible={open}
        onClose={() => setOpen(false)}
        placement="right-start"
        onNotificationClick={(item) => {
          // Override the default full-page redirect with client navigation.
          feedClient.markAsRead(item);
          const url = (item.data as PrototypeItemData | null)?.url;
          setOpen(false);
          if (url) navigate(url);
        }}
      />
    </>
  );
}
