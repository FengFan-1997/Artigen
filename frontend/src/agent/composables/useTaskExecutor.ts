import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { TaskPlan, TaskStep } from '../types/task';
import { resolveTarget } from '../utils/dom';

const STORAGE_KEY = 'agent_task_plan';

// Helper to wait for element with timeout
const waitForElement = (selector: string, timeout = 5000): Promise<HTMLElement> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      const el = resolveTarget(selector);

      if (el) {
        resolve(el);
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`Element ${selector} not found after ${timeout}ms`));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
};

export interface TaskResult {
  success: boolean;
  message?: string;
}

export function useTaskExecutor() {
  const plan = ref<TaskPlan | null>(null);
  const isExecuting = ref(false);
  const router = useRouter();

  // Restore state on mount (e.g. after page reload/navigation)
  const restoreState = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only resume if valid and not finished
        if (parsed && parsed.status === 'running') {
          plan.value = parsed;
          console.log('Resuming task plan...', plan.value);

          // If the current step was 'navigate', assume it completed successfully if we are back here
          if (plan.value && plan.value.steps[plan.value.currentStepIndex].type === 'navigate') {
            plan.value.steps[plan.value.currentStepIndex].status = 'completed';
            plan.value.currentStepIndex++;
          }

          executePlan(true); // Resume
        }
      } catch (e) {
        console.error('Failed to restore plan', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  const saveState = () => {
    if (plan.value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan.value));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const setPlan = async (rawPlan: any[]): Promise<TaskResult> => {
    plan.value = {
      id: Date.now().toString(),
      steps: rawPlan.map((s) => ({
        ...s,
        status: 'pending',
        description: generateDescription(s)
      })),
      status: 'pending',
      currentStepIndex: 0
    };
    saveState();
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

    if (resume) console.log('Resuming execution...');

    plan.value.status = 'running';
    isExecuting.value = true;
    saveState();

    // Start from current index
    for (let i = plan.value.currentStepIndex; i < plan.value.steps.length; i++) {
      plan.value.currentStepIndex = i;
      const step = plan.value.steps[i];

      step.status = 'running';
      saveState();

      try {
        await executeStep(step);
        step.status = 'completed';
        saveState();

        // Small pause between steps
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e: any) {
        console.error('Task execution failed:', e);
        step.status = 'failed';
        plan.value.status = 'failed';
        isExecuting.value = false;
        saveState();
        return { success: false, message: e.message || 'Unknown error' };
      }
    }

    plan.value.status = 'completed';
    isExecuting.value = false;
    saveState();

    // Auto clear after success
    setTimeout(() => {
      if (plan.value?.status === 'completed') {
        plan.value = null;
        localStorage.removeItem(STORAGE_KEY);
      }
    }, 5000);

    return { success: true };
  };

  const executeStep = async (step: TaskStep): Promise<void> => {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        // Base delay
        try {
          switch (step.type) {
            case 'navigate':
              console.log('Navigating to:', step.target);
              saveState();
              if (step.target?.startsWith('/') && router) {
                await router.push(step.target);
                // Wait for potential route transition
                await new Promise((r) => setTimeout(r, 500));
                resolve();
              } else {
                window.location.href = step.target!;
              }
              break;

            case 'click':
              try {
                const elClick = await waitForElement(step.target!);
                elClick.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Small delay to let scroll finish
                await new Promise((r) => setTimeout(r, 500));

                elClick.click();
                elClick.focus();
                resolve();
              } catch (e) {
                reject(e);
              }
              break;

            case 'hover':
              try {
                const elHover = await waitForElement(step.target!);
                elHover.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise((r) => setTimeout(r, 500));
                elHover.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                elHover.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                resolve();
              } catch (e) {
                reject(e);
              }
              break;

            case 'press':
              try {
                let elPress = document.activeElement as HTMLElement;
                if (step.target) {
                  elPress = await waitForElement(step.target);
                  elPress.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  await new Promise((r) => setTimeout(r, 500));
                  elPress.focus();
                }
                const key = step.value || 'Enter';
                const options = { key, code: key, bubbles: true, cancelable: true, view: window };
                elPress.dispatchEvent(new KeyboardEvent('keydown', options));
                elPress.dispatchEvent(new KeyboardEvent('keypress', options));
                elPress.dispatchEvent(new KeyboardEvent('keyup', options));
                resolve();
              } catch (e) {
                reject(e);
              }
              break;

            case 'input':
              try {
                const elInput = (await waitForElement(step.target!)) as HTMLInputElement;
                elInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise((r) => setTimeout(r, 500));
                elInput.focus();

                // Simulate typing
                elInput.value = step.value || '';
                elInput.dispatchEvent(new Event('input', { bubbles: true }));
                elInput.dispatchEvent(new Event('change', { bubbles: true }));
                resolve();
              } catch (e) {
                reject(e);
              }
              break;

            case 'highlight':
              try {
                const elHigh = await waitForElement(step.target!);
                elHigh.classList.add('agent-highlight-target');
                elHigh.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                  elHigh.classList.remove('agent-highlight-target');
                  resolve();
                }, 2000);
              } catch (e) {
                reject(e);
              }
              break;

            case 'scroll':
              const target = step.target;
              if (target === 'down') {
                window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
              } else if (target === 'up') {
                window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
              } else if (target === 'bottom') {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              } else if (target === 'top') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else if (target) {
                try {
                  const el = await waitForElement(target, 2000); // Short timeout for scroll target
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch {
                  // Ignore if scroll target not found
                  console.warn('Scroll target not found:', target);
                }
              }
              setTimeout(resolve, 1000); // Wait for scroll animation
              break;

            case 'wait':
              setTimeout(resolve, parseInt(step.value || '1000'));
              break;

            default:
              resolve();
          }
        } catch (e) {
          reject(e);
        }
      }, 500);
    });
  };

  const stopTask = () => {
    if (plan.value) {
      plan.value.status = 'failed'; // Or cancelled
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
