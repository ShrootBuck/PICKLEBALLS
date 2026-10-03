import {
  Activity,
  BellRing,
  CheckCircle2,
  CircleDashed,
  ClockAlert,
  Flag,
  Flame,
  History,
  MessageCircle,
  Mountain,
  PartyPopper,
  PencilLine,
  TriangleAlert,
  Trophy,
  Upload,
} from "lucide-react";

export function activityIcon(kind: string) {
  switch (kind) {
    case "TASK_CREATED":
      return PencilLine;
    case "PROOF_SUBMITTED":
      return Upload;
    case "PROOF_APPROVED":
      return CheckCircle2;
    case "PROOF_CHALLENGED":
      return TriangleAlert;
    case "TASK_MISSED":
      return ClockAlert;
    case "TASK_RENEGOTIATED":
      return History;
    case "CHECK_IN_SET":
      return Activity;
    case "REPLY_POSTED":
    case "INVITE_CREATED":
    case "INVITE_REVOKED":
      return MessageCircle;
    case "BUCKET_ITEM_PROPOSED":
    case "BUCKET_ITEM_APPROVED":
      return Mountain;
    case "BUCKET_ITEM_COMPLETION_REQUESTED":
      return Flag;
    case "BUCKET_ITEM_COMPLETED":
      return PartyPopper;
    case "STREAK_STARTED":
    case "STREAK_MILESTONE":
    case "STREAK_REMINDER":
      return Flame;
    case "STREAK_RETIRED":
      return Trophy;
    case "STREAK_NUDGE":
      return BellRing;
    default:
      return CircleDashed;
  }
}
