# static-website@1

Purpose: create a responsive offline static prototype and editable source package.

- Triggers: website, prototype, html, 网站, 原型, 网页
- Required capabilities: `files`, `shell`
- Allowed tools: `update_plan`, `delegate_tasks`, `sandbox_shell`, `declare_artifact`
- Plan template: define content and breakpoints → build source → package local assets → run offline server → inspect desktop/mobile/keyboard → declare ZIP and preview
- Delivery contract: include an offline-openable `index.html`; no CDN, remote font, analytics, hidden form submission, or external write.
- Validation: `website-entry`, `website-offline`, `website-responsive`
- Retry: repair one concrete build, asset, or layout failure.
- Stop: desktop/mobile and offline checks pass.

Good: local server smoke + offline asset check + responsive screenshots.

Bad: an HTML shell whose CSS or JavaScript only works from the public internet.
