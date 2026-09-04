export type ChangelogEntry = {
  date: string;
  title: string;
  description: string;
};

export const changelogEntries: ChangelogEntry[] = [
  {
    date: "2026-09-04",
    title: "Introducing the changelog",
    description:
      "New Changelog tab in the sidebar so everyone can see what changed and when. Agents now log every user-facing change here.",
  },
];
