# Third-party notices

This document lists Artigen's direct runtime dependencies across the frontend, backend, mail-relay and Python Agent Runtime workspaces. JavaScript versions are governed by `pnpm-lock.yaml`; the Python Agent Runtime pins its direct dependency in `backend/agent_runtime/requirements.txt`.

License identifiers come from the installed package metadata and upstream project notices. GSAP uses its upstream standard license rather than an SPDX open-source identifier. This file documents third-party components; it does not grant a license for Artigen itself and is not a complete transitive SBOM.

## Frontend runtime

| Package | License | Source |
| --- | --- | --- |
| `@codemirror/lang-css` | MIT | <https://github.com/codemirror/lang-css> |
| `@codemirror/lang-html` | MIT | <https://code.haverbeke.berlin/codemirror/lang-html> |
| `@codemirror/lang-javascript` | MIT | <https://github.com/codemirror/lang-javascript> |
| `@codemirror/lang-json` | MIT | <https://github.com/codemirror/lang-json> |
| `@codemirror/lang-markdown` | MIT | <https://code.haverbeke.berlin/codemirror/lang-markdown> |
| `@codemirror/merge` | MIT | <https://code.haverbeke.berlin/codemirror/merge> |
| `@codemirror/state` | MIT | <https://code.haverbeke.berlin/codemirror/state> |
| `@codemirror/view` | MIT | <https://code.haverbeke.berlin/codemirror/view> |
| `@uiw/codemirror-extensions-basic-setup` | MIT | <https://github.com/uiwjs/react-codemirror/tree/master/extensions/basic-setup> |
| `@uiw/codemirror-theme-vscode` | MIT | <https://github.com/uiwjs/react-codemirror/tree/master/themes/vscode> |
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

## Python Agent Runtime

| Package | License | Source |
| --- | --- | --- |
| `cua-sandbox` | MIT | <https://github.com/trycua/cua> |

## Verification and maintenance

When a workspace adds or removes a direct runtime dependency:

1. update this table in the same PR;
2. verify package metadata with `pnpm licenses list --prod --json`;
3. review non-standard or composite licenses separately;
4. run `pnpm check:docs`, which ensures every declared direct runtime dependency has a row.

Transitive license texts remain available in installed packages and their upstream repositories. Distribution and attribution obligations must be evaluated from the exact lockfile for each release artifact.
