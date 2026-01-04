import type { Ref } from 'vue';

export const createSystemSignals = (input: {
  currentLang: Ref<string>;
  onSignal: (summary: string, trigger: 'dom' | 'error') => void;
}) => {
  let domObserver: MutationObserver | null = null;
  let domFlushTimer: number | null = null;
  let lastDomSignalAt = 0;
  let lastDomSignalText = '';
  let pendingDomSignals: Array<{ text: string; type: 'dom' | 'error' }> = [];

  let systemSignalActive = false;
  let globalErrorHandler: ((e: Event) => void) | null = null;
  let globalRejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null;
  let globalSubmitHandler: ((e: Event) => void) | null = null;
  let originalFetch: typeof window.fetch | null = null;
  let originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  let originalXhrSend: typeof XMLHttpRequest.prototype.send | null = null;

  const classifyDomSignal = (text: string): 'error' | 'success' | null => {
    const t = text.toLowerCase();
    if (/(错误|失败|异常|报错|无法|error|failed|exception|traceback|stack|500|404|403)/i.test(t))
      return 'error';
    if (/(成功|完成|已生成|生成成功|done|success|completed|saved)/i.test(t)) return 'success';
    return null;
  };

  const pushDomSignal = (text: string, type: 'dom' | 'error') => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const now = Date.now();
    if (trimmed === lastDomSignalText && now - lastDomSignalAt < 1200) return;
    lastDomSignalAt = now;
    lastDomSignalText = trimmed;
    pendingDomSignals.push({ text: trimmed, type });
    if (pendingDomSignals.length > 8) pendingDomSignals = pendingDomSignals.slice(-8);
    if (domFlushTimer) window.clearTimeout(domFlushTimer);
    domFlushTimer = window.setTimeout(() => {
      domFlushTimer = null;
      const batch = pendingDomSignals;
      pendingDomSignals = [];
      const summary = batch
        .map((x) => x.text)
        .filter(Boolean)
        .slice(-4)
        .join('\n');
      if (!summary.trim()) return;
      const trigger = batch.some((x) => x.type === 'error') ? 'error' : 'dom';
      input.onSignal(summary, trigger);
    }, 350);
  };

  const startDomObserver = () => {
    if (typeof MutationObserver === 'undefined') return;
    if (domObserver) return;

    const scanNode = (node: Node): string[] => {
      const results: string[] = [];
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').trim();
        if (t) results.push(t);
        return results;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return results;
      const el = node as HTMLElement;

      const role = (el.getAttribute('role') || '').toLowerCase();
      const ariaLive = (el.getAttribute('aria-live') || '').toLowerCase();
      const className = typeof el.className === 'string' ? el.className : '';
      const isSignalContainer =
        role === 'alert' ||
        ariaLive === 'polite' ||
        ariaLive === 'assertive' ||
        /(toast|notification|notify|alert|error|success|snackbar|message)/i.test(className);

      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && text.length <= 240) {
        const kind = classifyDomSignal(text);
        if (kind === 'error')
          results.push(
            input.currentLang.value === 'zh'
              ? `页面提示错误：${text}`
              : `Page shows an error: ${text}`
          );
        else if (kind === 'success')
          results.push(
            input.currentLang.value === 'zh'
              ? `页面提示成功：${text}`
              : `Page shows success: ${text}`
          );
        else if (isSignalContainer && text.length <= 120)
          results.push(
            input.currentLang.value === 'zh' ? `页面提示：${text}` : `Page message: ${text}`
          );
      }

      if (el.children && el.children.length > 0 && el.children.length <= 12) {
        for (const child of Array.from(el.children)) results.push(...scanNode(child));
      }
      return results;
    };

    domObserver = new MutationObserver((mutations) => {
      const collected: string[] = [];
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const n of Array.from(m.addedNodes)) collected.push(...scanNode(n));
        } else if (m.type === 'characterData') {
          if (m.target) collected.push(...scanNode(m.target));
        } else if (m.type === 'attributes') {
          if (m.target) collected.push(...scanNode(m.target));
        }
      }

      const uniq = Array.from(new Set(collected.map((t) => t.trim()).filter(Boolean))).slice(0, 6);
      if (uniq.length === 0) return;
      const summary = uniq.join('\n');
      const kind = classifyDomSignal(summary);
      if (kind === 'error') pushDomSignal(summary, 'error');
      else pushDomSignal(summary, 'dom');
    });

    domObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-live', 'role']
    });
  };

  const stopDomObserver = () => {
    if (domObserver) {
      try {
        domObserver.disconnect();
      } catch {}
      domObserver = null;
    }
    if (domFlushTimer) window.clearTimeout(domFlushTimer);
    domFlushTimer = null;
    pendingDomSignals = [];
  };

  const formatUrlForSignal = (rawUrl: string) => {
    const url = (rawUrl || '').trim();
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      if (u.origin === window.location.origin) return u.pathname;
      return `${u.origin}${u.pathname}`;
    } catch {
      return url.split('?')[0].slice(0, 160);
    }
  };

  const shouldIgnoreNetworkSignal = (rawUrl: string) => {
    const u = (rawUrl || '').toLowerCase();
    if (!u) return true;
    if (u.includes('/api/chat')) return true;
    if (u.includes('/api/user')) return true;
    if (u.includes('generativelanguage.googleapis.com')) return true;
    return false;
  };

  const startSystemSignalObservers = () => {
    if (systemSignalActive) return;
    systemSignalActive = true;

    globalErrorHandler = (e: Event) => {
      try {
        const ev = e as any;
        const isErrorEvent = typeof ev?.message === 'string' || ev?.error;
        if (isErrorEvent) {
          const msg = String(ev?.message || ev?.error?.message || ev?.error || '').trim();
          if (!msg) return;
          if (/resizeobserver loop limit exceeded/i.test(msg)) return;
          if (/script error/i.test(msg)) return;
          if (/aborterror/i.test(msg)) return;
          const text =
            input.currentLang.value === 'zh' ? `页面脚本错误：${msg}` : `Page script error: ${msg}`;
          pushDomSignal(text.slice(0, 240), 'error');
          return;
        }
        const target = (ev?.target || ev?.srcElement) as HTMLElement | null;
        if (!target) return;
        const tag = (target.tagName || '').toLowerCase();
        const url =
          (target as any)?.src ||
          (target as any)?.href ||
          (target as any)?.currentSrc ||
          (target as any)?.getAttribute?.('src') ||
          (target as any)?.getAttribute?.('href') ||
          '';
        const resolved = formatUrlForSignal(String(url || ''));
        if (!resolved) return;
        const text =
          input.currentLang.value === 'zh'
            ? `资源加载失败：${tag} ${resolved}`
            : `Resource failed to load: ${tag} ${resolved}`;
        pushDomSignal(text.slice(0, 240), 'error');
      } catch {}
    };
    window.addEventListener('error', globalErrorHandler, true);

    globalRejectionHandler = (e: PromiseRejectionEvent) => {
      try {
        const reason: any = (e as any)?.reason;
        const msg =
          typeof reason === 'string'
            ? reason
            : typeof reason?.message === 'string'
              ? reason.message
              : typeof reason?.toString === 'function'
                ? reason.toString()
                : '';
        const trimmed = String(msg || '').trim();
        if (!trimmed) return;
        if (/aborterror/i.test(trimmed)) return;
        if (/cancelled|canceled/i.test(trimmed)) return;
        const isNetwork = /(failed to fetch|networkerror|load failed|timeout|err_network)/i.test(
          trimmed
        );
        const text =
          input.currentLang.value === 'zh'
            ? isNetwork
              ? `网络请求失败：${trimmed}`
              : `未处理的 Promise 异常：${trimmed}`
            : isNetwork
              ? `Network request failed: ${trimmed}`
              : `Unhandled promise rejection: ${trimmed}`;
        pushDomSignal(text.slice(0, 240), 'error');
      } catch {}
    };
    window.addEventListener('unhandledrejection', globalRejectionHandler);

    globalSubmitHandler = (e: Event) => {
      try {
        const form = e.target as HTMLFormElement | null;
        if (!form || typeof form.tagName !== 'string' || form.tagName.toLowerCase() !== 'form')
          return;
        const method = String(form.getAttribute('method') || 'GET')
          .trim()
          .toUpperCase();
        const action = String(form.getAttribute('action') || '').trim();
        const actionPath = action ? formatUrlForSignal(action) : window.location.pathname;
        const text =
          input.currentLang.value === 'zh'
            ? `检测到表单提交：${method} ${actionPath}`
            : `Form submitted: ${method} ${actionPath}`;
        pushDomSignal(text.slice(0, 200), 'dom');
      } catch {}
    };
    document.addEventListener('submit', globalSubmitHandler, true);

    if (!originalFetch && typeof window.fetch === 'function') {
      originalFetch = window.fetch.bind(window);
      window.fetch = (async (...args: any[]) => {
        const input0 = args[0] as any;
        const init = args[1] as any;
        const rawUrl =
          typeof input0 === 'string'
            ? input0
            : input0 instanceof URL
              ? input0.toString()
              : typeof input0?.url === 'string'
                ? input0.url
                : '';
        const method =
          typeof init?.method === 'string'
            ? init.method
            : typeof input0?.method === 'string'
              ? input0.method
              : 'GET';
        try {
          const res = await (originalFetch as any)(...args);
          if (!res?.ok) {
            const urlForSignal = formatUrlForSignal(rawUrl);
            if (urlForSignal && !shouldIgnoreNetworkSignal(rawUrl)) {
              const text =
                input.currentLang.value === 'zh'
                  ? `网络响应异常：${String(method).toUpperCase()} ${urlForSignal} (HTTP ${res.status})`
                  : `Network response error: ${String(method).toUpperCase()} ${urlForSignal} (HTTP ${res.status})`;
              pushDomSignal(text.slice(0, 240), 'error');
            }
          }
          return res;
        } catch (err: any) {
          const msg = String(err?.message || err || '').trim();
          if (msg && !/aborterror/i.test(msg)) {
            const urlForSignal = formatUrlForSignal(rawUrl);
            if (urlForSignal && !shouldIgnoreNetworkSignal(rawUrl)) {
              const text =
                input.currentLang.value === 'zh'
                  ? `网络请求失败：${String(method).toUpperCase()} ${urlForSignal} (${msg})`
                  : `Network request failed: ${String(method).toUpperCase()} ${urlForSignal} (${msg})`;
              pushDomSignal(text.slice(0, 240), 'error');
            }
          }
          throw err;
        }
      }) as any;
    }

    if (!originalXhrOpen && typeof XMLHttpRequest !== 'undefined') {
      originalXhrOpen = XMLHttpRequest.prototype.open;
      originalXhrSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method: any, url: any, ...rest: any[]) {
        try {
          (this as any).__agentMon = { method: String(method || 'GET'), url: String(url || '') };
        } catch {}
        return (originalXhrOpen as any).call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function (...sendArgs: any[]) {
        try {
          const info = (this as any).__agentMon || {};
          const rawUrl = String(info?.url || '');
          const urlForSignal = formatUrlForSignal(rawUrl);
          const method = String(info?.method || 'GET').toUpperCase();
          if (urlForSignal && !shouldIgnoreNetworkSignal(rawUrl)) {
            this.addEventListener(
              'loadend',
              () => {
                try {
                  const status = Number((this as any).status || 0);
                  if (status >= 400) {
                    const text =
                      input.currentLang.value === 'zh'
                        ? `网络响应异常：${method} ${urlForSignal} (HTTP ${status})`
                        : `Network response error: ${method} ${urlForSignal} (HTTP ${status})`;
                    pushDomSignal(text.slice(0, 240), 'error');
                  }
                } catch {}
              },
              { once: true }
            );
          }
        } catch {}
        return (originalXhrSend as any).call(this, ...sendArgs);
      };
    }
  };

  const stopSystemSignalObservers = () => {
    if (!systemSignalActive) return;
    systemSignalActive = false;
    if (globalErrorHandler) window.removeEventListener('error', globalErrorHandler, true);
    if (globalRejectionHandler)
      window.removeEventListener('unhandledrejection', globalRejectionHandler);
    if (globalSubmitHandler) document.removeEventListener('submit', globalSubmitHandler, true);
    globalErrorHandler = null;
    globalRejectionHandler = null;
    globalSubmitHandler = null;

    if (originalFetch) {
      window.fetch = originalFetch;
      originalFetch = null;
    }
    if (originalXhrOpen) {
      XMLHttpRequest.prototype.open = originalXhrOpen;
      originalXhrOpen = null;
    }
    if (originalXhrSend) {
      XMLHttpRequest.prototype.send = originalXhrSend;
      originalXhrSend = null;
    }
  };

  const stopAll = () => {
    stopDomObserver();
    stopSystemSignalObservers();
  };

  return {
    startDomObserver,
    stopDomObserver,
    startSystemSignalObservers,
    stopSystemSignalObservers,
    stopAll
  };
};
