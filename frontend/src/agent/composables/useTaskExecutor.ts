import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Modal } from 'ant-design-vue';
import type { TaskPlan, TaskStep } from '../types/task';
import { resolveTarget } from '../utils/dom';
import { recordDiagnostic } from '../utils/diagnostics';
import logger from '../utils/logger';

const STORAGE_KEY = 'agent_task_plan';

const safeStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
};

const safeStorageRemove = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {}
};

const isVisible = (el: HTMLElement): boolean => {
  try {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) <= 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    if (el.offsetParent === null && style.position !== 'fixed') return false;
    return true;
  } catch {
    return false;
  }
};

const normalizeText = (v: unknown, maxLen: number) => {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.slice(0, Math.max(0, maxLen));
};

const onlyDigits = (s: string) => String(s || '').replace(/[^\d]/g, '');

const luhnCheck = (digits: string) => {
  const s = onlyDigits(digits);
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number.parseInt(s[i], 10);
    if (!Number.isFinite(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

const looksLikeSecret = (s: string) => {
  const t = String(s || '').trim();
  if (!t) return false;
  if (t.length >= 240) return true;
  if (/-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/i.test(t)) return true;
  if (/\bsk-[a-zA-Z0-9]{20,}\b/.test(t)) return true;
  if (/\bAKIA[0-9A-Z]{16}\b/.test(t)) return true;
  if (/\bASIA[0-9A-Z]{16}\b/.test(t)) return true;
  if (/\bghp_[A-Za-z0-9]{30,}\b/.test(t)) return true;
  if (/\bBearer\s+[A-Za-z0-9\-_\.]{20,}\b/i.test(t)) return true;
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(t)) return true;
  if (
    /(api[_-]?key|access[_-]?key|secret|token|authorization)\s*[:=]\s*[A-Za-z0-9\-_\.]{12,}/i.test(
      t
    )
  )
    return true;
  return false;
};

const looksSensitiveInputValue = (value: string, targetHint?: string) => {
  const v = String(value || '').trim();
  if (!v) return false;
  if (looksLikeSecret(v)) return true;
  const digits = onlyDigits(v);
  if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) return true;
  const hint = String(targetHint || '').toLowerCase();
  const looksLikeOtp = digits.length === 6 && /^\d{6}$/.test(digits);
  if (
    looksLikeOtp &&
    /\b(otp|one[-_\s]?time|code|verify|verification|pin|2fa|mfa|auth)\b/.test(hint)
  )
    return true;
  return false;
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, Math.round(ms))));

const isSafeNavigateTarget = (raw: string) => {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (/^(javascript|data|vbscript):/i.test(s)) return { ok: false, reason: 'scheme' };
  if (s.startsWith('/')) return { ok: true, target: s.slice(0, 200) };
  try {
    const url = new URL(s, window.location.href);
    if (url.origin !== window.location.origin) return { ok: false, reason: 'cross_origin' };
    return { ok: true, target: `${url.pathname}${url.search}${url.hash}`.slice(0, 220) };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
};

const normalizeStepType = (t: unknown): TaskStep['type'] | null => {
  const v = String(t || '')
    .trim()
    .toLowerCase();
  if (
    v === 'navigate' ||
    v === 'highlight' ||
    v === 'click' ||
    v === 'input' ||
    v === 'wait' ||
    v === 'scroll' ||
    v === 'hover' ||
    v === 'press'
  )
    return v as any;
  return null;
};

const isUnsafeSelectorTarget = (target: string) => {
  const t = String(target || '').trim();
  if (!t) return true;
  if (t.startsWith('text:')) return false;
  if (t.length > 220) return true;
  if (t.includes('*')) return true;
  if (/:has\s*\(/i.test(t)) return true;
  return false;
};

const isSensitiveInputTarget = (targetHint: string) => {
  const t = String(targetHint || '').toLowerCase();
  if (!t) return false;
  if (/\b(pass(word)?|passwd|pwd|secret|credential)\b/i.test(t)) return true;
  return false;
};

const sanitizeRawPlan = (rawPlan: any[]) => {
  const src = Array.isArray(rawPlan) ? rawPlan : [];
  const out: Array<{ step: any; blocked?: string }> = [];
  const maxSteps = 10;

  for (const raw of src) {
    if (out.length >= maxSteps) break;
    if (!raw || typeof raw !== 'object') continue;
    const type = normalizeStepType((raw as any).type);
    if (!type) continue;

    const target = normalizeText((raw as any).target, 220);
    const valueRaw = (raw as any).value;
    const next: any = { type };

    if (type === 'navigate') {
      const nav = isSafeNavigateTarget(target);
      if (!nav.ok) {
        out.push({ step: { type: 'wait', value: 600 }, blocked: `navigate_blocked:${nav.reason}` });
        continue;
      }
      next.target = nav.target;
      out.push({ step: next });
      continue;
    }

    if (type === 'wait') {
      const ms = Number.parseInt(String((valueRaw ?? target) || '1000'), 10);
      next.value = String(Math.max(0, Math.min(15000, Number.isFinite(ms) ? ms : 1000)));
      out.push({ step: next });
      continue;
    }

    if (type === 'scroll') {
      const t0 = normalizeText(target, 120);
      const okKeyword = t0 === 'down' || t0 === 'up' || t0 === 'top' || t0 === 'bottom';
      if (!t0) continue;
      next.target = okKeyword ? t0 : t0;
      out.push({ step: next });
      continue;
    }

    if (type === 'press') {
      const key = normalizeText(valueRaw, 20);
      const allowed = new Set([
        'Enter',
        'Escape',
        'Tab',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Backspace',
        'Delete',
        'Space'
      ]);
      next.value = allowed.has(key) ? key : 'Enter';
      if (target) {
        if (isUnsafeSelectorTarget(target)) {
          out.push({ step: { type: 'wait', value: 600 }, blocked: 'press_blocked:unsafe_target' });
          continue;
        }
        next.target = target;
      }
      out.push({ step: next });
      continue;
    }

    if (type === 'input') {
      if (!target) continue;
      if (isUnsafeSelectorTarget(target)) {
        out.push({ step: { type: 'wait', value: 600 }, blocked: 'input_blocked:unsafe_target' });
        continue;
      }
      if (isSensitiveInputTarget(target)) {
        out.push({ step: { type: 'wait', value: 600 }, blocked: 'input_blocked:sensitive_target' });
        continue;
      }
      const v = String(valueRaw ?? '').toString();
      if (looksSensitiveInputValue(v, target)) {
        out.push({ step: { type: 'wait', value: 600 }, blocked: 'input_blocked:sensitive_value' });
        continue;
      }
      next.target = target;
      next.value = v.slice(0, 280);
      out.push({ step: next });
      continue;
    }

    if (type === 'click' || type === 'hover' || type === 'highlight') {
      if (!target) continue;
      if (isUnsafeSelectorTarget(target)) {
        out.push({ step: { type: 'wait', value: 600 }, blocked: `${type}_blocked:unsafe_target` });
        continue;
      }
      const blockedBySelector = /(^|\s)(html|body)\b/i.test(target);
      if (blockedBySelector) {
        out.push({ step: { type: 'wait', value: 600 }, blocked: `${type}_blocked:root` });
        continue;
      }
      next.target = target;
      out.push({ step: next });
      continue;
    }
  }

  return out;
};

const waitForElement = (selector: string, timeout = 5000): Promise<HTMLElement> => {
  return new Promise((resolve, reject) => {
    let done = false;
    let pollTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let observer: MutationObserver | null = null;

    const cleanup = () => {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
      if (timeoutTimer) window.clearTimeout(timeoutTimer);
      timeoutTimer = null;
      if (observer) observer.disconnect();
      observer = null;
    };

    const check = () => {
      if (done) return;
      const el = resolveTarget(selector);
      if (el && isVisible(el)) {
        done = true;
        cleanup();
        resolve(el);
      }
    };

    timeoutTimer = window.setTimeout(
      () => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error(`Element ${selector} not found after ${timeout}ms`));
      },
      Math.max(0, Math.round(timeout))
    );

    pollTimer = window.setInterval(check, 120);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      observer = new MutationObserver(check);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
    check();
  });
};

export interface TaskResult {
  success: boolean;
  message?: string;
  failureContext?: {
    stepIndex: number;
    stepType: string;
    target?: string;
    description?: string;
    error: string;
  };
}

export type TaskExecutorEvent =
  | { type: 'plan_start'; stepCount: number; resume: boolean }
  | { type: 'step_start'; stepIndex: number; step: TaskStep }
  | { type: 'step_done'; stepIndex: number; step: TaskStep; attempt: number }
  | { type: 'step_retry'; stepIndex: number; step: TaskStep; attempt: number; error: string }
  | { type: 'step_failed'; stepIndex: number; step: TaskStep; error: string }
  | { type: 'plan_done' }
  | { type: 'plan_failed'; stepIndex: number; error: string };

export function useTaskExecutor(options?: { onEvent?: (event: TaskExecutorEvent) => void }) {
  const plan = ref<TaskPlan | null>(null);
  const isExecuting = ref(false);
  const router = useRouter();
  const highRiskConfirmed = new Set<string>();

  // Restore state on mount (e.g. after page reload/navigation)
  const restoreState = () => {
    const saved = safeStorageGet(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only resume if valid and not finished
        if (parsed && parsed.status === 'running') {
          plan.value = parsed;
          logger.info('Resuming task plan', plan.value);

          // If the current step was 'navigate', assume it completed successfully if we are back here
          if (plan.value && plan.value.steps[plan.value.currentStepIndex].type === 'navigate') {
            plan.value.steps[plan.value.currentStepIndex].status = 'completed';
            plan.value.currentStepIndex++;
          }

          executePlan(true); // Resume
        }
      } catch (e) {
        logger.error('Failed to restore plan', e);
        safeStorageRemove(STORAGE_KEY);
      }
    }
  };

  const saveState = () => {
    if (plan.value) {
      safeStorageSet(STORAGE_KEY, JSON.stringify(plan.value));
    } else {
      safeStorageRemove(STORAGE_KEY);
    }
  };

  const setPlan = async (rawPlan: any[]): Promise<TaskResult> => {
    const cleaned = sanitizeRawPlan(rawPlan);
    const steps = cleaned.map((x) => x.step).filter(Boolean);
    if (steps.length === 0) {
      plan.value = null;
      safeStorageRemove(STORAGE_KEY);
      return { success: false, message: 'No safe steps in plan' };
    }
    plan.value = {
      id: Date.now().toString(),
      steps: steps.map((s) => ({
        ...s,
        status: 'pending',
        description: generateDescription(s)
      })),
      status: 'pending',
      currentStepIndex: 0,
      errorMessage: ''
    };
    saveState();
    try {
      const blocked = cleaned.filter((x) => x.blocked).map((x) => String(x.blocked || ''));
      recordDiagnostic({
        kind: 'task_plan_set',
        level: 'info',
        message: `steps=${steps.length} blocked=${blocked.length}`,
        data: blocked.length ? { blocked: blocked.slice(0, 12) } : undefined
      });
    } catch {}
    return executePlan();
  };

  const generateDescription = (step: any): string => {
    const target = step.target || '';
    const targetDesc = target.startsWith('text:') ? `"${target.replace('text:', '')}"` : target;

    switch (step.type) {
      case 'navigate':
        return `Go to ${step.target}`;
      case 'click':
        return `Click ${targetDesc}`;
      case 'input':
        return `Type "${step.value}" into ${targetDesc}`;
      case 'highlight':
        return `Find ${targetDesc}`;
      case 'scroll':
        return `Scroll ${targetDesc}`;
      case 'hover':
        return `Hover over ${targetDesc}`;
      case 'press':
        return `Press ${step.value || 'Enter'} on ${targetDesc || 'focused element'}`;
      case 'wait':
        return `Wait for ${step.value}ms`;
      default:
        return `Unknown step`;
    }
  };

  const executePlan = async (resume = false): Promise<TaskResult> => {
    if (!plan.value) return { success: false, message: 'No plan' };

    if (resume) logger.info('Resuming execution');

    plan.value.status = 'running';
    isExecuting.value = true;
    saveState();
    try {
      options?.onEvent?.({ type: 'plan_start', stepCount: plan.value.steps.length, resume });
    } catch {}

    // Start from current index
    for (let i = plan.value.currentStepIndex; i < plan.value.steps.length; i++) {
      plan.value.currentStepIndex = i;
      const step = plan.value.steps[i];

      step.status = 'running';
      saveState();
      try {
        options?.onEvent?.({ type: 'step_start', stepIndex: i, step });
      } catch {}

      try {
        recordDiagnostic({
          kind: 'task_step_start',
          level: 'info',
          message: `${step.type}`,
          data: { stepIndex: i, type: step.type, target: step.target, value: step.value }
        });
        const attempt = await executeStepWithRetry(step, i);
        step.status = 'completed';
        saveState();
        try {
          options?.onEvent?.({ type: 'step_done', stepIndex: i, step, attempt });
        } catch {}

        // Small pause between steps
        await delay(650);
      } catch (e: any) {
        logger.error('Task execution failed', e);
        step.status = 'failed';
        plan.value.status = 'failed';
        const errMsg = String(e?.message || 'Unknown error').slice(0, 300);
        plan.value.errorMessage = errMsg;
        isExecuting.value = false;
        saveState();
        try {
          options?.onEvent?.({ type: 'step_failed', stepIndex: i, step, error: errMsg });
          options?.onEvent?.({ type: 'plan_failed', stepIndex: i, error: errMsg });
        } catch {}
        try {
          recordDiagnostic({
            kind: 'task_step_failed',
            level: 'warn',
            message: errMsg,
            data: {
              stepIndex: i,
              type: step.type,
              target: step.target,
              description: step.description
            }
          });
        } catch {}
        return {
          success: false,
          message: errMsg,
          failureContext: {
            stepIndex: i,
            stepType: String(step.type || ''),
            target: step.target,
            description: step.description,
            error: errMsg
          }
        };
      }
    }

    plan.value.status = 'completed';
    plan.value.errorMessage = '';
    isExecuting.value = false;
    saveState();
    try {
      options?.onEvent?.({ type: 'plan_done' });
    } catch {}

    // Auto clear after success
    setTimeout(() => {
      if (plan.value?.status === 'completed') {
        plan.value = null;
        safeStorageRemove(STORAGE_KEY);
      }
    }, 5000);

    return { success: true };
  };

  const isBlockedByDom = (el: HTMLElement) => {
    try {
      if (el.hasAttribute('data-agent-block')) return true;
      const parent = el.closest?.('[data-agent-block]') as HTMLElement | null;
      return !!parent;
    } catch {
      return false;
    }
  };

  const isDangerousHref = (href: string) => {
    const s = String(href || '').trim();
    if (!s) return false;
    if (/^(javascript|data|vbscript):/i.test(s)) return true;
    try {
      const url = new URL(s, window.location.href);
      return url.origin !== window.location.origin;
    } catch {
      return true;
    }
  };

  const getActionLabel = (el: HTMLElement) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    const title = (el.getAttribute('title') || '').trim();
    const value =
      el instanceof HTMLInputElement || el instanceof HTMLButtonElement
        ? String((el as any).value || '').trim()
        : '';
    const text = String(el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    return (aria || title || value || text).slice(0, 120);
  };

  const isHighRiskActionText = (s: string) => {
    const t = String(s || '').toLowerCase();
    if (!t) return false;
    if (
      /(pay|payment|checkout|purchase|buy\s+now|place\s+order|confirm\s+order|submit\s+order)/i.test(
        t
      )
    )
      return true;
    if (/(transfer|send\s+money|withdraw|recharge|top\s*up|deposit)/i.test(t)) return true;
    if (/(delete|remove|destroy|drop|reset|format|erase|wipe|terminate|disable)/i.test(t))
      return true;
    if (
      /(支付|付款|下单|提交订单|确认订单|确认支付|购买|充值|转账|提现|删除|移除|清空|重置|注销|禁用)/.test(
        s
      )
    )
      return true;
    return false;
  };

  const looksLikeDownloadHref = (href: string) => {
    const s = String(href || '').trim();
    if (!s) return false;
    if (/^(javascript|data|vbscript):/i.test(s)) return false;
    const lowered = s.toLowerCase();
    if (/(^|[/?#&])download([/?#&]|$)/.test(lowered)) return true;
    if (
      /\.(zip|7z|rar|tar|gz|bz2|xz|exe|msi|dmg|pkg|apk|ipa|pdf|csv|xlsx|xls|docx|doc|pptx|ppt)([?#].*)?$/.test(
        lowered
      )
    )
      return true;
    return false;
  };

  const isHighRiskClickTarget = (el: HTMLElement) => {
    try {
      if (el instanceof HTMLInputElement) {
        const t = (el.type || '').toLowerCase();
        if (t === 'submit' || t === 'image') return 'Blocked submit click';
        if (t === 'reset') return 'High-risk reset click';
      }
      if (el instanceof HTMLButtonElement) {
        const t = (el.type || '').toLowerCase();
        if (t === 'submit') return 'Blocked submit click';
        if (t === 'reset') return 'High-risk reset click';
      }
      if (el instanceof HTMLAnchorElement) {
        const href = el.getAttribute('href') || '';
        if (el.hasAttribute('download') || looksLikeDownloadHref(href))
          return 'High-risk download click';
      }
      const role = (el.getAttribute('role') || '').toLowerCase();
      const isButtonish =
        el instanceof HTMLButtonElement ||
        (el instanceof HTMLInputElement &&
          ['button', 'submit', 'image', 'reset'].includes((el.type || '').toLowerCase())) ||
        role === 'button';
      if (isButtonish) {
        const label = getActionLabel(el);
        if (isHighRiskActionText(label)) return 'Blocked high-risk click';
      }
    } catch {}
    return '';
  };

  const ensureHighRiskConfirmed = async (step: TaskStep, el: HTMLElement, risk: string) => {
    const key = `${step.type}:${step.target || ''}:${risk}`;
    if (highRiskConfirmed.has(key)) return true;
    const label = getActionLabel(el);
    const target = (label || step.target || '').slice(0, 160);
    const ok = await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (v: boolean) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      try {
        Modal.confirm({
          title: '高风险操作确认',
          content: `检测到高风险操作：${target || '未知目标'}，是否继续执行？`,
          okText: '继续执行',
          cancelText: '取消',
          centered: true,
          maskClosable: false,
          keyboard: false,
          zIndex: 20000,
          class: 'agent-risk-modal',
          onOk: () => settle(true),
          onCancel: () => settle(false)
        } as any);
      } catch {
        try {
          settle(window.confirm(`检测到高风险操作：${target || '未知目标'}\n是否继续执行？`));
        } catch {
          settle(false);
        }
      }
    });
    try {
      recordDiagnostic({
        kind: 'task_high_risk_confirm',
        level: ok ? 'warn' : 'info',
        message: ok ? 'confirmed' : 'cancelled',
        data: { type: step.type, target: step.target, label, risk }
      });
    } catch {}
    if (ok) highRiskConfirmed.add(key);
    return ok;
  };

  const clickLike = (el: HTMLElement) => {
    const opts = { bubbles: true, cancelable: true, view: window } as any;
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const getPoint = () => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return {
        x: clamp(Math.round(x), 1, Math.max(1, window.innerWidth - 2)),
        y: clamp(Math.round(y), 1, Math.max(1, window.innerHeight - 2))
      };
    };
    const isHittable = (p: { x: number; y: number }) => {
      try {
        const top = document.elementFromPoint(p.x, p.y) as HTMLElement | null;
        if (!top) return false;
        return top === el || el.contains(top);
      } catch {
        return true;
      }
    };
    const p = getPoint();
    if (!isHittable(p)) throw new Error('Blocked click target (covered)');
    const moveOpts = { ...opts, clientX: p.x, clientY: p.y };
    try {
      el.dispatchEvent(new PointerEvent('pointerover', { ...moveOpts, pointerType: 'mouse' }));
      el.dispatchEvent(new PointerEvent('pointerenter', { ...moveOpts, pointerType: 'mouse' }));
      el.dispatchEvent(new PointerEvent('pointermove', { ...moveOpts, pointerType: 'mouse' }));
    } catch {
      el.dispatchEvent(new MouseEvent('mouseover', moveOpts));
      el.dispatchEvent(new MouseEvent('mouseenter', moveOpts));
      el.dispatchEvent(new MouseEvent('mousemove', moveOpts));
    }
    el.dispatchEvent(new MouseEvent('mouseover', moveOpts));
    el.dispatchEvent(new MouseEvent('mouseenter', moveOpts));
    el.dispatchEvent(new MouseEvent('mousemove', moveOpts));
    try {
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          ...moveOpts,
          pointerType: 'mouse',
          button: 0,
          buttons: 1
        })
      );
      el.dispatchEvent(
        new PointerEvent('pointerup', { ...moveOpts, pointerType: 'mouse', button: 0, buttons: 0 })
      );
    } catch {
      // ignore
    }
    el.dispatchEvent(new MouseEvent('mousedown', { ...moveOpts, button: 0, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...moveOpts, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...moveOpts, button: 0, buttons: 0 }));
  };

  const hoverLike = (el: HTMLElement) => {
    const opts = { bubbles: true, cancelable: true, view: window } as any;
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    const rect = el.getBoundingClientRect();
    const x = clamp(Math.round(rect.left + rect.width / 2), 1, Math.max(1, window.innerWidth - 2));
    const y = clamp(Math.round(rect.top + rect.height / 2), 1, Math.max(1, window.innerHeight - 2));
    const moveOpts = { ...opts, clientX: x, clientY: y };
    try {
      const top = document.elementFromPoint(x, y) as HTMLElement | null;
      if (top && top !== el && !el.contains(top)) throw new Error('Blocked hover target (covered)');
    } catch (e) {
      if (e instanceof Error && e.message.includes('covered')) throw e;
    }
    try {
      el.dispatchEvent(new PointerEvent('pointerover', { ...moveOpts, pointerType: 'mouse' }));
      el.dispatchEvent(new PointerEvent('pointerenter', { ...moveOpts, pointerType: 'mouse' }));
      el.dispatchEvent(new PointerEvent('pointermove', { ...moveOpts, pointerType: 'mouse' }));
    } catch {
      // ignore
    }
    el.dispatchEvent(new MouseEvent('mouseover', moveOpts));
    el.dispatchEvent(new MouseEvent('mouseenter', moveOpts));
    el.dispatchEvent(new MouseEvent('mousemove', moveOpts));
  };

  const setNativeValue = (
    el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string
  ) => {
    const anyEl = el as any;
    const proto = Object.getPrototypeOf(anyEl);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = desc?.set;
    if (setter) setter.call(anyEl, value);
    else anyEl.value = value;
  };

  const typeLike = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const v = String(value ?? '');
    const opts = { bubbles: true, cancelable: true, view: window } as any;
    const maxSim = 60;
    if (v.length > maxSim) {
      setNativeValue(el, v);
      try {
        el.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertReplacementText',
            data: v
          } as any)
        );
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    setNativeValue(el, '');
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContentBackward',
          data: null
        } as any)
      );
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    let cur = '';
    for (const ch of v) {
      const key = ch === '\n' ? 'Enter' : ch;
      const kev = {
        ...opts,
        key,
        code: key,
        charCode: ch.charCodeAt(0),
        keyCode: ch.charCodeAt(0)
      };
      el.dispatchEvent(new KeyboardEvent('keydown', kev));
      el.dispatchEvent(new KeyboardEvent('keypress', kev));
      cur += ch;
      setNativeValue(el, cur);
      try {
        el.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch } as any)
        );
      } catch {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent('keyup', kev));
      await delay(12 + Math.round(Math.random() * 18));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const executeStep = async (
    step: TaskStep,
    opts?: { elementTimeoutMs?: number }
  ): Promise<void> => {
    await delay(250);
    switch (step.type) {
      case 'navigate': {
        logger.info('Navigating to', step.target);
        saveState();
        if (!step.target) throw new Error('Missing navigate target');
        const nav = isSafeNavigateTarget(step.target);
        if (!nav.ok) throw new Error(`Navigation blocked: ${nav.reason}`);
        if (nav.target?.startsWith('/') && router) {
          await router.push(nav.target);
          await delay(500);
          return;
        }
        window.location.href = nav.target!;
        return;
      }

      case 'click': {
        if (!step.target) throw new Error('Missing click target');
        const elClick = await waitForElement(
          step.target,
          Math.max(1200, opts?.elementTimeoutMs || 5200)
        );
        if (isBlockedByDom(elClick)) throw new Error('Blocked click target');
        const tag = elClick.tagName.toLowerCase();
        if (tag === 'html' || tag === 'body') throw new Error('Blocked click target');
        if (elClick instanceof HTMLInputElement && elClick.type === 'file')
          throw new Error('Blocked file input click');
        if (
          elClick instanceof HTMLAnchorElement &&
          isDangerousHref(elClick.getAttribute('href') || '')
        )
          throw new Error('Blocked external navigation click');
        const risk = isHighRiskClickTarget(elClick);
        if (risk) {
          const ok = await ensureHighRiskConfirmed(step, elClick, risk);
          if (!ok) throw new Error('High-risk action cancelled');
        }
        elClick.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(450);
        try {
          elClick.focus();
        } catch {}
        clickLike(elClick);
        return;
      }

      case 'hover': {
        if (!step.target) throw new Error('Missing hover target');
        const elHover = await waitForElement(
          step.target,
          Math.max(1200, opts?.elementTimeoutMs || 5200)
        );
        if (isBlockedByDom(elHover)) throw new Error('Blocked hover target');
        const tag = elHover.tagName.toLowerCase();
        if (tag === 'html' || tag === 'body') throw new Error('Blocked hover target');
        elHover.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(450);
        hoverLike(elHover);
        return;
      }

      case 'press': {
        let elPress = document.activeElement as HTMLElement | null;
        if (step.target) {
          elPress = await waitForElement(
            step.target,
            Math.max(1200, opts?.elementTimeoutMs || 5200)
          );
          if (isBlockedByDom(elPress)) throw new Error('Blocked press target');
          elPress.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await delay(450);
          try {
            elPress.focus();
          } catch {}
        }
        if (!elPress) throw new Error('No focused element for press');
        const key = step.value || 'Enter';
        if (key === 'Enter') {
          const inForm = !!elPress.closest?.('form');
          const role = (elPress.getAttribute?.('role') || '').toLowerCase();
          const isSubmitLike =
            (elPress instanceof HTMLButtonElement &&
              (elPress.type || '').toLowerCase() === 'submit') ||
            (elPress instanceof HTMLInputElement &&
              (elPress.type || '').toLowerCase() === 'submit') ||
            role === 'button';
          if (inForm || isSubmitLike) {
            const ok = await ensureHighRiskConfirmed(step, elPress, 'High-risk enter press');
            if (!ok) throw new Error('High-risk action cancelled');
          }
        }
        const options = { key, code: key, bubbles: true, cancelable: true, view: window };
        elPress.dispatchEvent(new KeyboardEvent('keydown', options));
        elPress.dispatchEvent(new KeyboardEvent('keypress', options));
        elPress.dispatchEvent(new KeyboardEvent('keyup', options));
        return;
      }

      case 'input': {
        if (!step.target) throw new Error('Missing input target');
        const el = (await waitForElement(
          step.target,
          Math.max(1200, opts?.elementTimeoutMs || 6800)
        )) as HTMLElement | null;
        if (!el) throw new Error('Missing input element');
        if (isBlockedByDom(el)) throw new Error('Blocked input target');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(450);
        try {
          (el as any).focus?.();
        } catch {}

        const v = String(step.value || '');
        if (looksSensitiveInputValue(v, step.target)) throw new Error('Blocked sensitive input');
        if (el instanceof HTMLInputElement) {
          const t = (el.type || '').toLowerCase();
          if (t === 'password') throw new Error('Blocked password input');
          const ac = String(el.autocomplete || '').toLowerCase();
          const hint =
            `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
          if (
            ac.includes('one-time-code') ||
            /\b(otp|one[-_\s]?time|code|verify|verification|pin|2fa|mfa|auth)\b/.test(hint)
          )
            throw new Error('Blocked OTP input');
          if ((el as any).readOnly) throw new Error('Blocked readonly input');
          await typeLike(el, v);
          return;
        }
        if (el instanceof HTMLTextAreaElement) {
          if ((el as any).readOnly) throw new Error('Blocked readonly input');
          await typeLike(el, v);
          return;
        }
        if ((el as any)?.isContentEditable) {
          el.textContent = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (el instanceof HTMLSelectElement) {
          setNativeValue(el, v);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        throw new Error('Target is not input-capable');
      }

      case 'highlight': {
        if (!step.target) throw new Error('Missing highlight target');
        const elHigh = await waitForElement(
          step.target,
          Math.max(1200, opts?.elementTimeoutMs || 5200)
        );
        if (isBlockedByDom(elHigh)) throw new Error('Blocked highlight target');
        const tag = elHigh.tagName.toLowerCase();
        if (tag === 'html' || tag === 'body') throw new Error('Blocked highlight target');
        try {
          elHigh.classList.add('agent-highlight-target');
        } catch {}
        elHigh.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(1200);
        try {
          elHigh.classList.remove('agent-highlight-target');
        } catch {}
        return;
      }

      case 'scroll': {
        const target = step.target;
        if (target === 'down') window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        else if (target === 'up') window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
        else if (target === 'bottom')
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        else if (target === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (target && /^-?\d{1,6}$/.test(String(target).trim())) {
          const px = Number.parseInt(String(target).trim(), 10);
          window.scrollBy({ top: Number.isFinite(px) ? px : 0, behavior: 'smooth' });
        } else if (target) {
          try {
            const el = await waitForElement(target, 2600);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch {
            logger.warn('Scroll target not found', target);
          }
        }
        await delay(850);
        return;
      }

      case 'wait': {
        const ms = Number.parseInt(String(step.value || '1000'), 10);
        await delay(Number.isFinite(ms) ? ms : 1000);
        return;
      }
      default:
        return;
    }
  };

  const executeStepWithRetry = async (step: TaskStep, stepIndex: number): Promise<number> => {
    const retries =
      step.type === 'click' ||
      step.type === 'hover' ||
      step.type === 'input' ||
      step.type === 'press' ||
      step.type === 'highlight'
        ? 2
        : 0;
    const baseTimeout =
      step.type === 'input' ? 7000 : step.type === 'click' || step.type === 'hover' ? 5600 : 5200;

    let lastErr: any = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await executeStep(step, { elementTimeoutMs: baseTimeout + attempt * 2400 });
        try {
          recordDiagnostic({
            kind: 'task_step_done',
            level: 'info',
            message: `${step.type}`,
            data: { stepIndex, type: step.type, attempt }
          });
        } catch {}
        return attempt;
      } catch (e: any) {
        lastErr = e;
        if (attempt >= retries) break;
        const errMsg = String(e?.message || e || 'step_failed').slice(0, 260);
        try {
          options?.onEvent?.({ type: 'step_retry', stepIndex, step, attempt, error: errMsg });
        } catch {}
        try {
          recordDiagnostic({
            kind: 'task_step_retry',
            level: 'warn',
            message: errMsg,
            data: { stepIndex, type: step.type, target: step.target, attempt }
          });
        } catch {}
        const waitMs = 500 * Math.pow(2, attempt) + Math.round(Math.random() * 160);
        await delay(waitMs);
      }
    }
    throw lastErr || new Error('Step failed');
  };

  const stopTask = () => {
    if (plan.value) {
      plan.value.status = 'failed'; // Or cancelled
      plan.value.errorMessage = plan.value.errorMessage || 'Task stopped';
      isExecuting.value = false;
      saveState();
    }
  };

  // Auto-restore on init
  restoreState();

  return {
    plan,
    isExecuting,
    setPlan,
    executeTask: executePlan,
    stopTask
  };
}
