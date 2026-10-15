import DOMPurify from 'dompurify';
// Preview is static: sanitization removes navigation/active elements, while the
// empty iframe sandbox and CSP separately block scripts, forms and network I/O.
export const staticFileHtml = (text: string) => {
  const clean = DOMPurify.sanitize(text, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'meta',
      'base',
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'link',
      'video',
      'audio',
      'source'
    ],
    FORBID_ATTR: ['href', 'action', 'formaction', 'srcset', 'target', 'ping', 'download'],
    ALLOW_DATA_ATTR: false
  });
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-src 'none'">${clean}`;
};
