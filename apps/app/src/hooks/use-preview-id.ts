"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function usePreviewId(param = "selected", animationMs = 200) {
  const value = useSearchParams().get(param);
  const [rendered, setRendered] = useState(value);

  useEffect(() => {
    if (value) {
      setRendered(value);
      return;
    }
    const t = window.setTimeout(() => setRendered(null), animationMs);
    return () => window.clearTimeout(t);
  }, [value, animationMs]);

  return value ?? rendered;
}
