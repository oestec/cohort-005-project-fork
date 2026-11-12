// PROTOTYPE, throwaway. Placeholder copy for the four starter Notification
// types; the real wording is still fog on the map.
export type SampleKind =
  | "refund-request-decided"
  | "new-refund-request"
  | "new-question"
  | "seat-claimed";

export const SAMPLE_NOTIFICATIONS: Record<
  SampleKind,
  { label: string; actorName: string; title: string; body: string; url: string }
> = {
  "refund-request-decided": {
    label: "Refund decided",
    actorName: "A Platform Admin",
    title: "Your Refund Request was approved",
    body: "Introduction to TypeScript: $79.00 will be refunded.",
    url: "/courses/introduction-to-typescript",
  },
  "new-refund-request": {
    label: "New Refund Request",
    actorName: "Liam",
    title: "New Refund Request",
    body: "Liam asked for a refund on Introduction to TypeScript.",
    url: "/admin/refunds",
  },
  "new-question": {
    label: "New Question",
    actorName: "A Student",
    title: "New Question on “Generics”",
    body: "“Why does T extends keyof U not narrow here?”",
    url: "/instructor/questions",
  },
  "seat-claimed": {
    label: "Seat claimed",
    actorName: "A teammate",
    title: "A Seat was claimed",
    body: "3 of 10 Seats are now in use on your team.",
    url: "/team",
  },
};

export type PrototypeItemData = {
  kind?: SampleKind;
  title?: string;
  body?: string;
  url?: string;
};
