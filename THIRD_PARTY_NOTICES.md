# Third-party notices

## herdr-web-ui

Parts of `bridge/` are adapted from
[herdr-web-ui](https://github.com/devswha/herdr-web-ui):

- `bridge/src/herdr/client.ts` (from `server/herdr/client.ts`)
- `bridge/src/pty/host.mjs` (from `server/pty/pty-host.mjs`)
- `bridge/src/pty/session.ts` (from `server/pty/session.ts`)
- `bridge/src/claude/transcript.ts`, the Claude project-directory
  encoding (from `server/claude-store.ts`)
- `bridge/src/usage.ts`, the Claude usage lookup (from `server/usage.ts`)
- `bridge/src/claude/commands.ts`, plugin and skill discovery (from `server/commands.ts`)
- `src/components/atoms/ClaudeMark.tsx`, the Claude mark path data (from `src/components/AgentMark.tsx`)

```
MIT License

Copyright (c) 2026 devswha

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## herdr

`shared/src/herdr/schema.json` is the output of `herdr api schema
--json`, and `shared/src/herdr/generated/` is generated from it.
[herdr](https://github.com/herdrdev/herdr) is licensed under the
Apache License 2.0
(https://www.apache.org/licenses/LICENSE-2.0); devhub doesn't include
or modify herdr's source.

## Not covered by the MIT license

The MIT license in `LICENSE` covers devhub's code. It doesn't grant
rights to the following, which remain with their owners:

- **devhub brand marks:** the devhub mark and app icons
  (`src/components/atoms/BrandMark.tsx`, `src-tauri/app-icon*.svg`,
  `src-tauri/icons/`, `public/favicon.svg`, `public/*.png`), © Nieky
  Allen. Forks should replace them with their own.
- **The Claude mark** (`src/components/atoms/ClaudeMark.tsx`) is a
  trademark of Anthropic, used only to identify Claude Code panes.
- **Fonts:** the UI is designed for Clash Display and General Sans by
  the Indian Type Foundry. Their license (ITF Free Font License) doesn't
  allow redistribution, so they aren't in this repository; see the
  README to add them. Without them the app uses system fonts.
