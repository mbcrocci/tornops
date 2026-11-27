import { Mount } from "@effect/ui";
import { Effect, Queue, Stream } from "effect";

/** Where the pointer is across an element: a fraction of its width, or null once it leaves. */
export type PointerAcross = { readonly fraction: number | null; readonly width: number };

/** Reports the pointer's horizontal position over the element while it moves or presses. */
export const TrackPointer = Mount.makeStream("TrackPointer", {}, (node: HTMLElement) =>
  Stream.callback<PointerAcross>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const report = (event: PointerEvent) => {
          const bounds = node.getBoundingClientRect();
          const fraction = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
          Queue.offerUnsafe(queue, { fraction, width: bounds.width });
        };
        const leave = () => Queue.offerUnsafe(queue, { fraction: null, width: 0 });
        node.addEventListener("pointermove", report);
        node.addEventListener("pointerdown", report);
        node.addEventListener("pointerleave", leave);
        return () => {
          node.removeEventListener("pointermove", report);
          node.removeEventListener("pointerdown", report);
          node.removeEventListener("pointerleave", leave);
        };
      }),
      (remove) => Effect.sync(remove),
    ),
  ),
);
