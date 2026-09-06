import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pickle Balls",
    short_name: "Pickleballs",
    description:
      "Schoolwork promises. Photo receipts. Friends who call the bluff.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fcfcfd",
    theme_color: "#f7f7f9",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
