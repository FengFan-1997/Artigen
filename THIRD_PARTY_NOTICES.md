# Third-party notices

This document lists Artigen's direct runtime dependencies across the frontend, backend and mail-relay workspaces. Exact installed versions are governed by `pnpm-lock.yaml`; this table intentionally avoids duplicating version numbers that would drift from the lockfile.

License identifiers come from the installed package metadata and upstream project notices. GSAP uses its upstream standard license rather than an SPDX open-source identifier. This file documents third-party components; it does not grant a license for Artigen itself and is not a complete transitive SBOM.

## Frontend runtime

| Package | License | Source |
| --- | --- | --- |
| `@codemirror/lang-css` | MIT | <https://github.com/codemirror/lang-css> |
| `@codemirror/lang-html` | MIT | <https://code.haverbeke.berlin/codemirror/lang-html> |
| `@codemirror/lang-javascript` | MIT | <https://github.com/codemirror/lang-javascript> |
| `@codemirror/lang-json` | MIT | <https://github.com/codemirror/lang-json> |
| `@codemirror/lang-markdown` | MIT | <https://code.haverbeke.berlin/codemirror/lang-markdown> |
| `@lucide/vue` | ISC and MIT (Feather-derived icons) | <https://github.com/lucide-icons/lucide> |
| `@uiw/codemirror-theme-vscode` | MIT | <https://github.com/uiwjs/react-codemirror> |
| `@codemirror/merge` | MIT | <https://code.haverbeke.berlin/codemirror/merge> |
| `@codemirror/state` | MIT | <https://code.haverbeke.berlin/codemirror/state> |
| `@codemirror/view` | MIT | <https://code.haverbeke.berlin/codemirror/view> |
| `codemirror` | MIT | <https://github.com/codemirror/basic-setup> |
| `dompurify` | (MPL-2.0 OR Apache-2.0) | <https://github.com/cure53/DOMPurify> |
| `markdown-it` | MIT | <https://github.com/markdown-it/markdown-it> |
| `@ant-design/icons-vue` | MIT | <https://github.com/ant-design/ant-design-icons> |
| `@fortawesome/fontawesome-free` | CC-BY-4.0 AND OFL-1.1 AND MIT | <https://fontawesome.com> |
| `@jsquash/jpeg` | Apache-2.0 | <https://github.com/jamsinclair/jSquash> |
| `@jsquash/png` | Apache-2.0 | <https://github.com/jamsinclair/jSquash> |
| `@jsquash/webp` | Apache-2.0 | <https://github.com/jamsinclair/jSquash> |
| `@novnc/novnc` | MPL-2.0 | <https://github.com/novnc/noVNC> |
| `@tanstack/vue-query` | MIT | <https://tanstack.com/query> |
| `@uppy/aws-s3` | MIT | <https://uppy.io> |
| `@uppy/core` | MIT | <https://uppy.io> |
| `ant-design-vue` | MIT | <https://www.antdv.com> |
| `dexie` | Apache-2.0 | <https://dexie.org> |
| `echarts` | Apache-2.0 | <https://echarts.apache.org> |
| `fabric` | MIT | <https://github.com/fabricjs/fabric.js> |
| `fflate` | MIT | <https://github.com/101arrowz/fflate> |
| `gifenc` | MIT | <https://github.com/mattdesl/gifenc> |
| `gsap` | GSAP Standard License | <https://gsap.com/standard-license> |
| `pdfjs-dist` | Apache-2.0 | <https://github.com/mozilla/pdf.js> |
| `pinia` | MIT | <https://pinia.vuejs.org> |
| `serve` | MIT | <https://github.com/vercel/serve> |
| `vue` | MIT | <https://vuejs.org> |
| `vue-echarts` | MIT | <https://github.com/ecomfe/vue-echarts> |
| `vue-router` | MIT | <https://router.vuejs.org> |

## Lucide attribution

The following notice is distributed with `@lucide/vue`:

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

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

## Backend and mail runtime

| Package | License | Source |
| --- | --- | --- |
| `@aws-sdk/client-s3` | Apache-2.0 | <https://github.com/aws/aws-sdk-js-v3> |
| `@aws-sdk/s3-request-presigner` | Apache-2.0 | <https://github.com/aws/aws-sdk-js-v3> |
| `ajv` | MIT | <https://ajv.js.org> |
| `busboy` | MIT | <https://github.com/mscdex/busboy> |
| `cors` | MIT | <https://github.com/expressjs/cors> |
| `dotenv` | BSD-2-Clause | <https://github.com/motdotla/dotenv> |
| `express` | MIT | <https://expressjs.com> |
| `file-type` | MIT | <https://github.com/sindresorhus/file-type> |
| `https-proxy-agent` | MIT | <https://github.com/TooTallNate/proxy-agents> |
| `node-fetch` | MIT | <https://github.com/node-fetch/node-fetch> |
| `node-pg-migrate` | MIT | <https://github.com/salsita/node-pg-migrate> |
| `nodemailer` | MIT-0 | <https://nodemailer.com> |
| `pg` | MIT | <https://github.com/brianc/node-postgres> |
| `pg-boss` | MIT | <https://github.com/timgit/pg-boss> |
| `sharp` | Apache-2.0 | <https://github.com/lovell/sharp> |
| `ws` | MIT | <https://github.com/websockets/ws> |
| `zod` | MIT | <https://zod.dev> |

`ajv` is used by the Runtime V2 validation path present on the development branch. It remains listed here so the notice stays valid when the docs hotfix is synchronized from `main` back to `dev`.

## Verification and maintenance

When a workspace adds or removes a direct runtime dependency:

1. update this table in the same PR;
2. verify package metadata with `pnpm licenses list --prod --json`;
3. review non-standard or composite licenses separately;
4. run `pnpm check:docs`, which ensures every declared direct runtime dependency has a row.

Transitive license texts remain available in installed packages and their upstream repositories. Distribution and attribution obligations must be evaluated from the exact lockfile for each release artifact.
