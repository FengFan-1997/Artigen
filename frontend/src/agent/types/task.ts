export type TaskStepType =
  | 'navigate'
  | 'highlight'
  | 'click'
  | 'input'
  | 'wait'
  | 'scroll'
  | 'hover'
  | 'press';

export interface TaskStep {
  type: TaskStepType;
  target?: string; // CSS selector or URL
  value?: string; // For input
  description?: string; // Generated description for UI
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface TaskPlan {
  id: string;
  steps: TaskStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStepIndex: number;
}
