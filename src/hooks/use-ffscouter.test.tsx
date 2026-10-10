// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";
import { useFFScouterData } from "./use-ffscouter";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not poll stats on the live-data interval or refetch a reordered roster", async () => {
  useCredentialsStore.setState({ ffscouterKey: "hook-test-key" });
  useGlobalStore.setState({ refetchInterval: 1000 });
  const fetch = vi.fn().mockResolvedValue(new Response("[]"));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, rerender } = renderHook(({ ids }) => useFFScouterData(ids), {
    wrapper,
    initialProps: { ids: [2, 1] },
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  rerender({ ids: [1, 2] });
  expect(fetch).toHaveBeenCalledTimes(1);
  client.clear();
});
