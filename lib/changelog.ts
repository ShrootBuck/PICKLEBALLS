export type ChangelogEntry = {
  // Milliseconds since the Unix epoch (Date.now()). Day grouping and labels
  // are derived at render time, so entries never carry display strings.
  timestamp: number;
  title: string;
  description: string;
};

export const changelogEntries: ChangelogEntry[] = [
  {
    timestamp: 1788540444539,
    title: "Weekly timeblock PDFs",
    description:
      "Proof uploads now record start and finish times, then automatically build a two-page weekly report with a numbered task list and a Monday-through-Sunday schedule for duplex printing.",
  },
  {
    timestamp: 1788536713347,
    title: "Layout rebuilt for every screen",
    description:
      "Reworked the app shell and shared UI so announcements, navigation, cards, forms, dialogs, tables, and public pages fit cleanly from small phones through wide desktops.",
  },
  {
    timestamp: 1788536172006,
    title: "Announcement banner",
    description:
      "Added a dismissible banner at the top of the site for announcements.",
  },
  {
    timestamp: 1788497429615,
    title: "Fixed proof upload validation",
    description:
      "Submitting proof without a photo now shows the friendly error message instead of silently failing. HEIF photos are also accepted in the file picker.",
  },
  {
    timestamp: 1788497160603,
    title: "Rich changelog entries",
    description:
      "Changelog entries now render as Markdown with [Comark](https://comark.dev/) — **bold**, *italic*, `code`, lists, tables, task lists, alerts, :rocket: emoji, footnotes, math, diagrams, and syntax-highlighted code blocks.",
  },
  {
    timestamp: 1788495464329,
    title: "Simple landing page",
    description:
      "The homepage now shows a short intro with a link to the open-source repo instead of bouncing you straight to sign-in.",
  },
  {
    timestamp: 1788495235599,
    title: "Open source on GitHub",
    description:
      "The sign-in screen got a refresh and now links to the public repo at ShrootBuck/PICKLEBALLS. You can also jump to it from your profile menu.",
  },
  {
    timestamp: 1788495235598,
    title: "Multiple circles are here",
    description:
      "Anyone can sign up with Discord and start their own private circle, join several circles with invite links, and switch between them from the sidebar. Every circle stays fully private.",
  },
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
