import {
  Activity,
  CheckCircle2,
  CircleDashed,
  ClockAlert,
  Flag,
  History,
  MessageCircle,
  Mountain,
  PartyPopper,
  PencilLine,
  TriangleAlert,
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
    default:
      return CircleDashed;
  }
}
