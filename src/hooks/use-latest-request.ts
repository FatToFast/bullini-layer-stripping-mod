import { useEffect, useRef } from "react";

export type LatestRequestToken = {
  requestId: number;
  signal: AbortSignal;
};

export function isAbortError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.toLowerCase().includes("abort");
  }

  return false;
}

export function useLatestRequest() {
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  function begin(): LatestRequestToken {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    requestIdRef.current += 1;
    return {
      requestId: requestIdRef.current,
      signal: controller.signal,
    };
  }

  function isCurrent(requestId: number) {
    return requestIdRef.current === requestId && controllerRef.current?.signal.aborted !== true;
  }

  function finish(requestId: number) {
    if (!isCurrent(requestId)) return false;
    controllerRef.current = null;
    return true;
  }

  function cancel() {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  return {
    begin,
    isCurrent,
    finish,
    cancel,
  };
}
