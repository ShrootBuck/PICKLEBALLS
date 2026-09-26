import type { UIMessageStreamOnEndCallback } from "ai";
import type { TimeblockAgentMessage } from "@/lib/timeblock-agent";

const interrupted =
  "The response was interrupted. Your conversation and completed edits are saved. Try again.";

export function createTimeblockStreamState() {
  // Remain interrupted until the SDK confirms a completed response. A closed
  // connection or timeout alone is not evidence of success.
  let error: string | null = interrupted;
  let failed = false;
  const onEnd: UIMessageStreamOnEndCallback<TimeblockAgentMessage> = ({
    outcome,
    finishReason,
  }) => {
    if (failed) return;
    if (outcome.status === "completed" && finishReason === "stop") {
      error = null;
    } else if (finishReason === "length") {
      error =
        "The response reached its limit. Completed edits are saved. Try again to finish.";
    }
  };
  return {
    get error() {
      return error;
    },
    // The SDK also calls this for recoverable tool validation failures. It
    // formats public text only; it must never change the run's error state.
    onError: () => "That step couldn't be completed. The AI can retry it.",
    onEnd,
    recordFailure() {
      failed = true;
      error = interrupted;
    },
  };
}
