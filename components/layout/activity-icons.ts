import {
  Activity,
  CheckCircle2,
  CircleDashed,
  ClockAlert,
  History,
  MessageCircle,
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
    default:
      return CircleDashed;
  }
}
