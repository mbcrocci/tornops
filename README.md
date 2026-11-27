# TornOps

A Torn ranked-war toolkit: war room, chain watcher, war planning, war report and payouts, and bounties.

Built with [Effect UI](https://github.com/Effect-TS/ui) (`@effect/ui` and `@effect/ui-kit`), Effect v4, Tailwind CSS and [Vite+](https://viteplus.dev).

```sh
vp install
vp run dev      # http://localhost:3000
vp test         # unit, Story and Scene tests
vp check        # format, lint and type check
vp run build
```

## Layout

- `src/main.ts`: mounts the app with the browser host and router.
- `src/App.ts`: the root component. It owns the settings, which persist to `localStorage`, and provides the query layers.
- `src/routes.ts`: the typed routes.
- `src/pages/`: one component per route. All but the war room load lazily.
- `src/queries/`: Torn, FFScouter and local queries, with the commands that refresh them.
- `src/components/`: shared components and view functions. `components/ui/` holds the styled primitives.
- `src/domain/`: Schemas for the settings.
- `src/lib/`: framework-free logic: API fetchers, analysis, caches and IndexedDB storage.
