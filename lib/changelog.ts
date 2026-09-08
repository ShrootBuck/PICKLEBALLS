export type ChangelogEntry = {
  // Milliseconds since the Unix epoch (Date.now()). Day grouping and time labels
  // are derived at render time, so entries never carry display strings.
  timestamp: number;
  title: string;
  description: string;
};

export const changelogEntries: ChangelogEntry[] = [
  {
    timestamp: 1788905143377,
    title: "Your circle, in a feed",
    description:
      "See friends’ proof and check-ins on Home, like their progress, and open profiles for their posts and daily tasks. Each check-in now has its own comments. Review pending proof directly from a post.",
  },
  {
    timestamp: 1788821935108,
    title: "One quieter notification inbox",
    description:
      "Replies, proof photos, verdicts, and weekly reminders now share one inbox. Task changes, check-ins, and missed-task alerts are gone. Replies and verdicts are always included; photo push alerts and the weekly reminder are optional.",
  },
  {
    timestamp: 1788821388711,
    title: "Edit member names",
    description:
      "Owners can edit anyone’s name, including their own, in Owner tools. Use a full name to have it appear across the app and on future timeblock PDF exports.",
  },
  {
    timestamp: 1788820239820,
    title: "Simpler owner tools",
    description:
      "Owners can now delete members from their circle. Removed the invite history and AI usage panels.",
  },
  {
    timestamp: 1788819941675,
    title: "Simpler screen time uploads",
    description:
      "Choose Week in Screen Time, go back one week, and upload the average. Screenshots labeled Last Week’s Average work without calendar dates or a visible device selector. Check the numbers and confirm to post to the current leaderboard.",
  },
  {
    timestamp: 1788818744494,
    title: "Weekly screen time, with receipts",
    description:
      "Screen Time is back in the sidebar. Upload one iPhone screenshot for the completed Sunday–Saturday week, check the AI read, and confirm it to join your circle’s leaderboard. See daily averages, week-over-week changes, most improved, and your last 12 weeks. Sunday reminders and a persistent Today prompt keep missing submissions visible until you post.",
  },
  {
    timestamp: 1788817039581,
    title: "AI reads stick around",
    description:
      "Proof history now keeps the full AI read, including its one-liner, evidence, and caveats, after a proof is verified or challenged.",
  },
  {
    timestamp: 1788761000619,
    title: "Your color, your call",
    description:
      "Open Settings from the sidebar or your account menu to choose a primary color: neutral, pink, violet, blue, mint, or amber. Changes apply immediately and save to your account across devices.",
  },
  {
    timestamp: 1788735633031,
    title: "Every approval needs a comment",
    description:
      "Approving proof now requires a comment explaining why it counts, just as challenging proof requires a reason.",
  },
  {
    timestamp: 1788672025243,
    title: "Browse proof photos in the app",
    description:
      "Open photo attachments at full size and browse between them without leaving the app.",
  },
  {
    timestamp: 1788671166953,
    title: "Full-size phone photo uploads",
    description:
      "Upload full-resolution phone photos up to 100 MB without having to shrink them first.",
  },
  {
    timestamp: 1788650480818,
    title: "Photos and videos in replies and proof",
    description:
      "Attach up to six photos or videos to replies and task proof, preview them before posting, and reply with just an image. Squad members review video proof; AI does not watch videos.",
  },
  {
    timestamp: 1788634180194,
    title: "Proof closes at midnight",
    description:
      "Past days are closed to new or replacement proof. Unfinished tasks from earlier days no longer appear on Today.",
  },
  {
    timestamp: 1788583391053,
    title: "Late work stays reachable",
    description:
      "Unfinished tasks from earlier days now appear on Today with a late-proof button.",
  },
  {
    timestamp: 1788583391052,
    title: "Promises stay honest",
    description:
      "Once you submit proof, the task wording is locked so everyone reviews the same promise you made.",
  },
  {
    timestamp: 1788583391044,
    title: "A timeblock editor for phones",
    description:
      "Edit your weekly report with task cards on your phone. Drafts save on this device, and report edits leave your original tasks and proof alone.",
  },
  {
    timestamp: 1788540444539,
    title: "Weekly timeblock PDFs",
    description:
      "Proof uploads now record start and finish times, then automatically build a two-page weekly report with a numbered task list and a Monday-through-Sunday schedule for duplex printing.",
  },
  {
    timestamp: 1788495235598,
    title: "Multiple circles are here",
    description:
      "Anyone can sign up with Discord and start their own private circle, join several circles with invite links, and switch between them from the sidebar. Every circle stays fully private.",
  },
];
