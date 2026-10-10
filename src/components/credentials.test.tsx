// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useCredentialsStore } from "@/lib/stores";
import { CredentialsCard, validateFFScouterKey, validateTornKey } from "./credentials";

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useCredentialsStore.setState({
    publicKey: undefined,
    ffscouterKey: undefined,
    isTornKeyValid: undefined,
    isFFScouterKeyValid: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function enterKeys(scouterKey?: string) {
  render(<CredentialsCard />);
  fireEvent.change(screen.getByLabelText("Torn Limited Access API Key"), {
    target: { value: " torn-key " },
  });
  if (scouterKey) {
    fireEvent.change(screen.getByLabelText(/FFScouter API Key/), {
      target: { value: scouterKey },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "Validate" }));
}

describe("Login validation", () => {
  it("validates and saves the Torn key when FFScouter is omitted", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ chain: { current: 0 } }));
    vi.stubGlobal("fetch", fetch);
    enterKeys();
    expect(screen.getByText("Login")).toBeTruthy();
    await waitFor(() => expect(useCredentialsStore.getState().publicKey).toBe("torn-key"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useCredentialsStore.getState().ffscouterKey).toBeUndefined();
  });

  it("checks both keys and saves them after both pass", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ chain: { current: 0 } }))
      .mockResolvedValueOnce(response([{ player_id: 1 }]));
    vi.stubGlobal("fetch", fetch);
    enterKeys(" scouter-key ");
    await waitFor(() => expect(useCredentialsStore.getState().publicKey).toBe("torn-key"));
    expect(useCredentialsStore.getState().ffscouterKey).toBe("scouter-key");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["Torn", "FFScouter"])(
    "does not save keys when %s validation fails",
    async (failedKey) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            response(failedKey === "Torn" ? { error: { code: 2 } } : { chain: {} }),
          )
          .mockResolvedValueOnce(
            response(failedKey === "FFScouter" ? { error: "Invalid key" } : []),
          ),
      );
      enterKeys("scouter-key");
      await screen.findByText(new RegExp(`Could not validate your ${failedKey} key`));
      expect(useCredentialsStore.getState().publicKey).toBeUndefined();
      expect(useCredentialsStore.getState().ffscouterKey).toBeUndefined();
    },
  );

  it("keeps inputs intact while hiding and revealing a key", () => {
    render(<CredentialsCard />);
    const input = screen.getByLabelText("Torn Limited Access API Key") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abcdef" } });
    fireEvent.change(input, { target: { value: "abcdefg" } });
    expect(input.value).toBe("abcdefg");
    expect(input.type).toBe("password");
    fireEvent.click(screen.getAllByRole("button", { name: "Show key" })[0]);
    expect(input.type).toBe("text");
    expect(input.value).toBe("abcdefg");
  });

  it("shows key help when the label's info icon receives keyboard focus", async () => {
    render(<CredentialsCard />);
    fireEvent.focus(screen.getByRole("button", { name: "About the Torn API key" }));
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      expect.stringContaining("Reads your player status"),
    );
  });

  it("rejects HTTP errors and malformed success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ chain: {} }, 403))
        .mockResolvedValueOnce(response({}))
        .mockResolvedValueOnce(response([], 500))
        .mockResolvedValueOnce(response({})),
    );
    expect(await validateTornKey("key")).toBe(false);
    expect(await validateTornKey("key")).toBe(false);
    expect(await validateFFScouterKey("key")).toBe(false);
    expect(await validateFFScouterKey("key")).toBe(false);
  });
});
