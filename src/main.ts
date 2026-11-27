import { Router } from "@effect/ui";
import { BrowserHost, BrowserRouter } from "@effect/ui/html";
import { Effect, Layer } from "effect";
import { App } from "./App.ts";
import { loadSettings } from "./domain/Settings.ts";
import { AppRoute } from "./routes.ts";
import "./styles.css";

const Main = BrowserHost.mount(
  App,
  Router.props(AppRoute).pipe(
    Effect.map(({ route }) => ({ route, initialSettings: loadSettings(localStorage) })),
  ),
  document.getElementById("app")!,
).pipe(Layer.provide(BrowserRouter.layer({ routes: AppRoute })));

// A deploy can remove the chunk an old page still asks for: load the new version.
window.addEventListener("vite:preloadError", () => window.location.reload());

Layer.launch(Main).pipe(Effect.runFork);
