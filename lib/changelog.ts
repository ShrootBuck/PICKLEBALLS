export type ChangelogEntry = {
  // Milliseconds since the Unix epoch (Date.now()). Day grouping and labels
  // are derived at render time, so entries never carry display strings.
  timestamp: number;
  title: string;
  description: string;
};

export const changelogEntries: ChangelogEntry[] = [
  {
    timestamp: 1788494751018,
    title: "More reliable proof uploads",
    description:
      "Fixed a bug where submitting a photo proof could silently fail. The upload now uses the form data captured up front.",
  },
  {
    timestamp: 1788494751018,
    title: "Quieter countdown for screen readers",
    description:
      "The midnight countdown no longer announces every second. Screen readers can still read the time on demand.",
  },
  {
    timestamp: 1788494751018,
    title: "Consistent notification controls",
    description:
      "Rebuilt the notification tabs and preference toggles on the shared button component for a more consistent look.",
  },
  {
    timestamp: 1788494751018,
    title: "Introducing the changelog",
    description:
      "New Changelog tab in the sidebar so everyone can see what changed and when. Agents now log every user-facing change here.",
  },
];
