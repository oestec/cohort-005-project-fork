// PROTOTYPE, throwaway. Icons per starter Notification type, shared by B and C.
import { Bell, MessageSquare, Receipt, ReceiptText, UserRoundCheck } from "lucide-react";
import type { SampleKind } from "./samples";

export function KindIcon({ kind, className }: { kind?: SampleKind; className?: string }) {
  switch (kind) {
    case "refund-request-decided":
      return <ReceiptText className={className} />;
    case "new-refund-request":
      return <Receipt className={className} />;
    case "new-question":
      return <MessageSquare className={className} />;
    case "seat-claimed":
      return <UserRoundCheck className={className} />;
    default:
      return <Bell className={className} />;
  }
}
