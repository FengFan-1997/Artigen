export interface AvatarPlanStepBase {
  type: string;
  duration?: number;
  parallel?: boolean;
}

export interface PoseStep extends AvatarPlanStepBase {
  type: 'pose';
  motion: string;
  expression?: string;
}

export interface MotionStep extends AvatarPlanStepBase {
  type: 'motion';
  motion: string;
}

export interface ExpressionStep extends AvatarPlanStepBase {
  type: 'expression' | 'emotion';
  expression: string;
}

export interface SpeakStep extends AvatarPlanStepBase {
  type: 'speak';
  text: string;
  motion?: string;
  expression?: string;
  bubble?: boolean; // Default true
}

export interface BubbleStep extends AvatarPlanStepBase {
  type: 'bubble';
  text: string;
  duration?: number;
}

export interface LookAtStep extends AvatarPlanStepBase {
  type: 'look_at';
  x: number;
  y: number;
}

export interface WaitStep extends AvatarPlanStepBase {
  type: 'wait';
}

export interface MoveStep extends AvatarPlanStepBase {
  type: 'move';
  x?: number | string; // Absolute pixels or percentage string
  y?: number | string;
  scale?: number; // Target scale multiplier (1.0 is default)
  immediate?: boolean; // If true, no animation
}

export interface EventStep extends AvatarPlanStepBase {
  type: 'event';
  name: string;
  payload?: any;
}

export interface ConsoleStep extends AvatarPlanStepBase {
  type: 'console';
  message: string;
}

export type AvatarPlanStep =
  | PoseStep
  | MotionStep
  | ExpressionStep
  | SpeakStep
  | BubbleStep
  | LookAtStep
  | WaitStep
  | MoveStep
  | EventStep
  | ConsoleStep;

export type AvatarPlan = AvatarPlanStep[];
