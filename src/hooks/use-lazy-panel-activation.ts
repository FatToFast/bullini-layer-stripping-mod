import { useEffect, useRef, useState } from "react";

type Options = {
  defer: boolean;
  rootMargin?: string;
};

export function useLazyPanelActivation({ defer, rootMargin = "240px" }: Options) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [isActivated, setIsActivated] = useState(!defer);

  useEffect(() => {
    if (!defer) {
      setIsActivated(true);
      return;
    }

    if (isActivated) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsActivated(true);
      return;
    }

    const element = panelRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setIsActivated(true);
          observer.disconnect();
          break;
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [defer, isActivated, rootMargin]);

  return {
    isActivated,
    activate: () => setIsActivated(true),
    panelRef,
  };
}
