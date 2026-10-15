"use client";

import { useEffect, useState } from "react";

/** Local previews for picked photos. Videos and unreadable files get null. */
export function useObjectUrls(files: File[]) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    const next = files.map((file) =>
      file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    );
    setUrls(next);
    return () => {
      for (const url of next) if (url) URL.revokeObjectURL(url);
    };
  }, [files]);
  return urls;
}
