export type ChangelogEntry = {
  // Milliseconds since the Unix epoch (Date.now()). Day grouping and labels
  // are derived at render time, so entries never carry display strings.
  timestamp: number;
  title: string;
  description: string;
};

export const changelogEntries: ChangelogEntry[] = [
  {
    timestamp: 1788584997071,
    title: "Fixed the startup crash",
    description:
      "The app was crashing on load because the production database was missing two notification categories the code asks about. A database update adds them, so pages load again.",
  },
  {
    timestamp: 1788583391054,
    title: "Boards stay up to date",
    description:
      "Today, Squad, check-ins, replies, and notifications now refresh while you use the app, with a manual refresh button and an offline indicator. Typed drafts stay put, and switching circles clears the previous circle’s view.",
  },
  {
    timestamp: 1788583391053,
    title: "Late work stays reachable",
    description:
      "Unfinished tasks from earlier days now appear on Today with a late-proof button. The midnight countdown refreshes the board when the Phoenix day changes, and deadlines are clearly labeled.",
  },
  {
    timestamp: 1788583391052,
    title: "Promises stay honest",
    description:
      "Tasks with submitted proof can no longer be rewritten. Competing uploads, edits, and verdicts are handled consistently, and saving unchanged wording no longer notifies your friends.",
  },
  {
    timestamp: 1788583391051,
    title: "Clearer proof review",
    description:
      "Proof cards show the full task and definition of done, including in history. The verdict queue focuses on work needing your vote; historical proof stays reviewable, and proof links open the right tab.",
  },
  {
    timestamp: 1788583391050,
    title: "Phone photos upload more reliably",
    description:
      "Photos up to 20 MB are resized on your device before upload, with a preview and clearer file errors. Upload and review dialogs stay open while saving, and image requests recheck access after sign-out.",
  },
  {
    timestamp: 1788583391049,
    title: "AI reads recover from interruptions",
    description:
      "Photo analysis runs in the background and can be retried if it fails or gets stuck. Retry buttons recover properly, duplicate retries are limited, and the AI still leaves every verdict to friends.",
  },
  {
    timestamp: 1788583391048,
    title: "Invites work across circles",
    description:
      "Discord invites now work for returning users as well as new accounts. Circles with the same name are kept distinct, expired sign-in invites show a useful message, and the current circle has an Open button.",
  },
  {
    timestamp: 1788583391047,
    title: "Notifications that go somewhere",
    description:
      "Notification links open the correct circle, day, tab, and reply thread. The bell has accessible tabs, older notifications can be loaded reliably, and private invitation activity stays out of the shared feed.",
  },
  {
    timestamp: 1788583391046,
    title: "Notification settings do what they say",
    description:
      "Optional notifications for new or edited tasks and check-ins are now delivered. Settings show save errors and retry controls, and read actions only update after the server confirms them.",
  },
  {
    timestamp: 1788583391045,
    title: "Push follows this device’s account",
    description:
      "Push settings check whether this device is connected to your account, and sign-out disconnects its notifications. Failed service-worker setup no longer leaves the button waiting forever, and push destinations are restricted to browser push services.",
  },
  {
    timestamp: 1788583391044,
    title: "A timeblock editor for phones",
    description:
      "The weekly report now uses readable task cards instead of a wide editing table. Drafts save on this device separately for each account, circle, and week; report edits leave original tasks and proof alone.",
  },
  {
    timestamp: 1788583391043,
    title: "More dependable weekly reports",
    description:
      "Work crossing the week’s boundary is included, replacement proof keeps one report row, and status badges refresh. Blank task names are caught before downloading, and short or crowded PDF blocks no longer spill labels into neighboring cells.",
  },
  {
    timestamp: 1788583391042,
    title: "Long conversations stay usable",
    description:
      "Threads show the newest replies and offer a button to load earlier messages. Reply links open their thread, and refreshed activity keeps the conversation current.",
  },
  {
    timestamp: 1788583391041,
    title: "Mobile navigation and accessible controls",
    description:
      "Fixed a mobile startup error, close the sidebar after navigation, and improved phone touch targets, form sizing, card alignment, and dialog spacing. Screen readers get one main content region and proper review lists; tabs and warning badges have clearer contrast.",
  },
  {
    timestamp: 1788583391040,
    title: "Small-screen polish and recovery",
    description:
      "Date navigation stays compact, long task descriptions wrap, and app errors have working retry controls. Removed the old announcement, enabled landscape use and text selection, and kept changelog math styling on its own page.",
  },
  {
    timestamp: 1788583391039,
    title: "Safer requests and dependable deadlines",
    description:
      "Malformed dates, cookies, and payloads now fail cleanly. Circle changes check request origin, expensive actions have shared rate limits, and overdue-task reconciliation works in small batches and reports failures.",
  },
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
