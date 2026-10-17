import { POLL_TIMEOUT } from "./utils";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type Options = {
  /** Resolves once a request may be sent; called once per request actually sent. */
  throttle: (signal?: AbortSignal) => Promise<void>;
  fetch?: typeof fetch;
  timeout?: number;
  rateLimitWait?: number;
  rateLimitRetries?: number;
};

export type TornGetOptions = {
  signal?: AbortSignal;
  /** The caller already took a throttle slot for the first attempt. */
  slotAcquired?: boolean;
};

const waitFor = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Creates a Torn API GET helper. Each attempt is throttled once, the timeout covers the
 * response body as well as the headers, and rate-limit errors are retried after a wait.
 */
export function createTornGet({
  throttle,
  fetch: fetchImpl = (...args) => fetch(...args),
  timeout = POLL_TIMEOUT,
  rateLimitWait = 61_000,
  rateLimitRetries = 2,
}: Options) {
  const attempt = async (url: string, key: string, signal?: AbortSignal) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeout);
    try {
      const response = await fetchImpl(url, {
        headers: { Authorization: `ApiKey ${key}` },
        signal: controller.signal,
      });
      // A body can stall after the headers arrive; reading it races the same abort.
      const data: unknown = await new Promise((resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
          once: true,
        });
        response.json().then(resolve, reject);
      });
      return { response, data };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };

  return async (
    url: string,
    key: string,
    { signal, slotAcquired = false }: TornGetOptions = {},
  ): Promise<Record<string, unknown>> => {
    for (let retry = 0; ; retry++) {
      if (retry > 0 || !slotAcquired) await throttle(signal);
      const { response, data } = await attempt(url, key, signal);
      const apiError = isRecord(data) && isRecord(data.error) ? data.error : null;
      // Other pages may have used up the key's limit; wait for it to reset instead of failing.
      if ((response.status === 429 || apiError?.code === 5) && retry < rateLimitRetries) {
        await waitFor(rateLimitWait, signal);
        continue;
      }
      if (apiError) {
        const message = apiError.error;
        throw new Error(typeof message === "string" ? message : "Torn API returned an error");
      }
      if (!response.ok || !isRecord(data)) {
        throw new Error(`Torn API request failed (${response.status})`);
      }
      return data;
    }
  };
}
