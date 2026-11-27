import { assert, describe, it } from "@effect/vitest";
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing";
import { Story } from "@effect/ui/testing";
import { Effect } from "effect";
import { afterEach, expect, vi } from "vite-plus/test";
import { validateFFScouterKey, validateTornKey } from "@/lib/credentials";
import { Credentials, CredentialsEvents, CredentialsMessage, ValidateKeys } from "./credentials";

const props = {
  initialTornKey: null,
  initialFFScouterKey: null,
  isTornKeyValid: null,
  isFFScouterKeyValid: null,
  card: true,
  showErrors: false,
};

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Login validation", () => {
  it.effect("validates the Torn key alone and asks to store it, without FFScouter", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(Credentials, props);
      s.send(CredentialsMessage.UpdatedTornKey({ value: " torn-key " }));
      s.send(CredentialsMessage.SubmittedCredentials());
      assert.strictEqual(s.model.tornValidation, "validating");
      assert.strictEqual(s.model.scouterValidation, "idle");
      assert.deepStrictEqual(s.pending[0].command.args, { tornKey: "torn-key", scouterKey: "" });
      s.resolve(
        ValidateKeys,
        CredentialsMessage.CompletedValidateKeys({ tornValid: true, scouterValid: true }),
      );
      s.emitted(
        CredentialsEvents.RequestedCredentials({ publicKey: "torn-key", ffscouterKey: null }),
      );
    }),
  );

  it.effect("keeps both keys when one fails, and says which", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(Credentials, props);
      s.send(CredentialsMessage.UpdatedTornKey({ value: "torn-key" }));
      s.send(CredentialsMessage.UpdatedFFScouterKey({ value: "scouter-key" }));
      s.send(CredentialsMessage.SubmittedCredentials());
      s.resolve(
        ValidateKeys,
        CredentialsMessage.CompletedValidateKeys({ tornValid: true, scouterValid: false }),
      );
      assert.strictEqual(s.model.tornValidation, "valid");
      assert.strictEqual(s.model.scouterValidation, "invalid");
      assert.strictEqual(s.model.scouterKey, "scouter-key");
    }),
  );

  it.effect("keeps inputs intact while hiding and revealing a key", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(Credentials, props);
      s.send(CredentialsMessage.UpdatedTornKey({ value: "secret" }));
      s.send(CredentialsMessage.ClickedRevealTornKey());
      assert.isTrue(s.model.showTornKey);
      s.send(CredentialsMessage.ClickedRevealTornKey());
      assert.isFalse(s.model.showTornKey);
      assert.strictEqual(s.model.tornKey, "secret");
    }),
  );

  it.effect("labels the key field and starts it hidden", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(Credentials, props);
      const tornKey = HtmlLocator.label("Torn Limited Access API Key");
      s.type(tornKey, "secret").expect(tornKey).toHaveAttribute("type", "password");
      s.expect(tornKey).toHaveValue("secret");
    }),
  );

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
