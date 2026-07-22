# Third-party notices

Artigen uses the following direct open-source foundations in this upgrade. No source of unknown provenance was copied into the repository. Package license texts remain available in their distributed npm packages and upstream repositories.

| Package / project | Pinned version | License | Use | Source |
| --- | ---: | --- | --- | --- |
| pg-boss | 12.26.2 | MIT | PostgreSQL-backed task delivery, retry, dead letter and schedules | <https://github.com/timgit/pg-boss> |
| Uppy Core / AWS S3 | 5.2.0 / 5.1.0 | MIT | Headless single and multipart S3/R2 uploads | <https://github.com/transloadit/uppy> |
| TanStack Vue Query | 5.101.4 | MIT | Browser server-state cache, retries and refetch | <https://github.com/TanStack/query> |
| Dexie | 4.4.4 | Apache-2.0 | IndexedDB access while preserving existing databases | <https://github.com/dexie/Dexie.js> |
| jSquash JPEG / PNG / WebP | 1.6.0 / 3.1.1 / 1.5.0 | Apache-2.0 | Lazy Worker image encoding based on Squoosh codecs | <https://github.com/jamsinclair/jSquash> |
| file-type | 22.0.1 | MIT | Server-side file signature detection | <https://github.com/sindresorhus/file-type> |
| sharp | 0.35.3 | Apache-2.0 | Trusted image metadata and pixel limits | <https://github.com/lovell/sharp> |
| AWS SDK S3 request presigner | 3.1087.0 | Apache-2.0 | Short-lived S3/R2 upload URLs | <https://github.com/aws/aws-sdk-js-v3> |

Existing retained foundations:

| Package / project | Version | License | Source |
| --- | ---: | --- | --- |
| Fabric.js | 7.4.0 | MIT | <https://github.com/fabricjs/fabric.js> |
| PDF.js (`pdfjs-dist`) | 4.10.38 | Apache-2.0 | <https://github.com/mozilla/pdf.js> |

Test-only tooling:

- `fake-indexeddb` 6.2.4 (Apache-2.0) is a development dependency used for browser database compatibility tests.
- A pinned MinIO container is started only as an ephemeral CI S3-compatibility fixture. MinIO is not linked, copied, bundled, deployed, or used as an Artigen runtime dependency.

AGPL `background-removal-js` and the long-unmaintained TUI Image Editor are intentionally not included.
