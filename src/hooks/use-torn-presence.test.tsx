// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserFaction, useUserFactionData, useEnemyFactionData } from "./use-torn";
import { useCredentialsStore, useGlobalStore } from "@/lib/stores";
import { usePresenceHistoryState } from "@/lib/faction-presence";
import { readActivity, readActivityFactions, recordObservation } from "@/lib/activity-tracking";
import { WarPlanning } from "@/components/war-planning";

vi.mock("@/lib/activity-tracking", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activity-tracking")>()),
  recordObservation: vi.fn().mockResolvedValue(undefined),
  readActivityFactions: vi.fn().mockResolvedValue([]),
  readActivity: vi.fn().mockResolvedValue([]),
}));
const faction = (id: number) => ({
  ID: id,
  name: `Faction ${id}`,
  ranked_wars: {},
  members: { 1: { name: "Target", last_action: { status: "Online" } } },
});
const fetchMock = vi.fn();
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => faction(url.includes("/faction/42") ? 42 : 7),
  }));
  vi.mocked(recordObservation).mockResolvedValue(undefined);
  vi.mocked(readActivityFactions).mockResolvedValue([]);
  vi.mocked(readActivity).mockResolvedValue([]);
  useCredentialsStore.setState({ publicKey: "test-key", isTornKeyValid: true });
  useGlobalStore.setState({ enemyFactionId: 42 });
  usePresenceHistoryState.setState({ revision: 0, errors: {} });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

describe("automatic faction presence history", () => {
  it("records both existing faction requests without mounting the viewer", async () => {
    const { result } = renderHook(
      () => ({ ours: useUserFactionData(), enemy: useEnemyFactionData() }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.ours.isSuccess && result.current.enemy.isSuccess).toBe(true),
    );
    expect(recordObservation).toHaveBeenCalledWith(faction(7), expect.any(Number));
    expect(recordObservation).toHaveBeenCalledWith(faction(42), expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(usePresenceHistoryState.getState().revision).toBe(2);
  });
  it("also records the basic response used to discover ranked wars", async () => {
    const { result } = renderHook(() => useUserFaction(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recordObservation).toHaveBeenCalledWith(faction(7), expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not store API errors or incomplete member statuses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { error: "Too many requests" } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...faction(42), members: { 1: { name: "Target" } } }),
    });
    const { result } = renderHook(
      () => ({ ours: useUserFactionData(), enemy: useEnemyFactionData() }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.ours.isFetched && result.current.enemy.isFetched).toBe(true),
    );
    expect(recordObservation).not.toHaveBeenCalled();
  });
  it("does not record an enemy response for a different faction", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => faction(99) });
    const { result } = renderHook(() => useEnemyFactionData(), { wrapper });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(recordObservation).not.toHaveBeenCalled();
  });
  it("keeps live faction data usable when history storage fails", async () => {
    vi.mocked(recordObservation).mockRejectedValueOnce(new Error("Storage full"));
    const { result } = renderHook(() => useUserFactionData(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(faction(7));
    expect(usePresenceHistoryState.getState().errors[7]).toBe("Storage full");
    expect(usePresenceHistoryState.getState().revision).toBe(0);
    await result.current.refetch();
    expect(usePresenceHistoryState.getState().errors[7]).toBeUndefined();
    expect(usePresenceHistoryState.getState().revision).toBe(1);
  });
  it("opens saved history without starting faction requests or showing tracking controls", async () => {
    vi.mocked(readActivityFactions).mockResolvedValue([{ id: 42, name: "Previous opponent" }]);
    render(<WarPlanning />, { wrapper });
    await screen.findByRole("button", { name: "Previous opponent · Opponent" });
    await waitFor(() => expect(readActivity).toHaveBeenCalledWith(42));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Track faction" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause tracking" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Faction ID" })).toBeNull();
  });
});
