// A pause that ends early when its signal aborts. Pure (no imports), so `npm run test:unit` covers it.

/** Waits `ms`; resolves true when the time passed, false at once if `signal` is (or becomes) aborted. */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(ok);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(true), ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
