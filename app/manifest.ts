import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pickle Balls",
    short_name: "Pickle Balls",
    description:
      "Three schoolwork promises. Photo receipts. Friends who call the bluff.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f6f7f2",
    theme_color: "#23412e",
    categories: ["education", "productivity", "lifestyle"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon?maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [],
    shortcuts: [
      {
        name: "Today",
        short_name: "Today",
        description: "See your three promises for today",
        url: "/",
        icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
      },
      {
        name: "Squad",
        short_name: "Squad",
        description: "Check on your squad",
        url: "/squad",
        icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
      },
      {
        name: "Screen Time",
        short_name: "Screen Time",
        description: "Post your Screen Time receipt",
        url: "/screen-time",
        icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
      },
    ],
    prefer_related_applications: false,
  };
}
