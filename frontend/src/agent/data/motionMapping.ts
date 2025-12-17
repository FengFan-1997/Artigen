// Logic Motion Names
// These are the high-level semantic names used by the AI and Agent system.
// They map to different internal groups/files for Cubism2 vs Cubism3 models.

export type LogicMotion =
  | 'idle' // Neutral waiting state
  | 'tap_body' // Standard interaction (click/touch)
  | 'flick_head' // Head pat / hit
  | 'shake' // Refusal / Angry / Dizzy
  | 'nod' // Agreement (if supported)
  | 'talking' // Speaking motion
  | 'happy' // Explicit happy/success gesture
  | 'sad' // Sad/disappointed gesture
  | 'surprised' // Shocked gesture
  | 'activity' // Energetic / Presenting
  | 'friend' // Friendly / Waving
  | 'mail' // Checking something / Subtle
  | 'morning' // Greeting
  | 'afternoon' // Casual
  | 'evening' // Tired / Relaxed
  | 'point_left'
  | 'point_right'
  | 'wave'
  | 'tilt_left'
  | 'tilt_right'
  | 'step_forward'
  | 'step_back'
  | 'shake_head'
  | 'mood_happy'
  | 'mood_angry'
  | 'mood_tired'
  | 'mood_sleepy'
  | 'mood_confused';

export type LogicExpression =
  | 'neutral'
  | 'happy'
  | 'angry'
  | 'sad'
  | 'shy'
  | 'surprised'
  | 'dizzy'
  | 'confused';

export interface ExpressionMappingConfig {
  v2: {
    name: string; // e.g. "f01", "happy"
  };
  v3: {
    name: string; // e.g. "f01", "Happy" - matches the alias or filename in Expressions
  };
}

export const EXPRESSION_MAPPING: Record<LogicExpression, ExpressionMappingConfig> = {
  neutral: {
    v2: { name: 'f01' },
    v3: { name: 'f01' }
  },
  happy: {
    v2: { name: 'f02' },
    v3: { name: 'f02' }
  },
  angry: {
    v2: { name: 'f03' },
    v3: { name: 'f03' }
  },
  sad: {
    v2: { name: 'f04' },
    v3: { name: 'f04' }
  },
  shy: {
    v2: { name: 'f05' },
    v3: { name: 'f05' }
  },
  surprised: {
    v2: { name: 'f06' },
    v3: { name: 'f06' }
  },
  dizzy: {
    v2: { name: 'f07' },
    v3: { name: 'f07' }
  },
  confused: {
    v2: { name: 'f08' },
    v3: { name: 'f08' }
  }
};

// Mapping Structure
export interface MotionMappingConfig {
  v2: {
    group: string;
    priority?: number; // Optional priority override
  };
  v3: {
    group: string; // The motion group name in .model3.json (e.g. "Tap", "Idle")
    index?: number; // Optional specific index in that group
    // In future, we could add file name matching if group isn't enough
  };
}

const V3_IDLE_GROUP = 'Idle';
const V3_TAP_GROUP = 'Tap';

export const MOTION_MAPPING: Record<LogicMotion, MotionMappingConfig> = {
  idle: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 0 }
  },
  tap_body: {
    v2: { group: 'tap_body' },
    v3: { group: V3_TAP_GROUP, index: 5 }
  },
  flick_head: {
    v2: { group: 'flick_head' },
    v3: { group: V3_TAP_GROUP, index: 6 }
  },
  shake: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 3 }
  },
  nod: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 1 }
  },
  talking: {
    v2: { group: 'talking' },
    v3: { group: V3_IDLE_GROUP, index: 2 }
  },
  happy: {
    v2: { group: 'pinch_out' },
    v3: { group: V3_TAP_GROUP, index: 1 }
  },
  sad: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 4 }
  },
  surprised: {
    v2: { group: 'flick_head' },
    v3: { group: V3_TAP_GROUP, index: 2 }
  },
  activity: {
    v2: { group: 'pinch_in' },
    v3: { group: V3_TAP_GROUP, index: 7 }
  },
  friend: {
    v2: { group: 'pinch_out' },
    v3: { group: V3_TAP_GROUP, index: 13 }
  },
  mail: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 3 }
  },
  morning: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 4 }
  },
  afternoon: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 5 }
  },
  evening: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 6 }
  },
  point_left: {
    v2: { group: 'tap_body' },
    v3: { group: V3_TAP_GROUP, index: 8 }
  },
  point_right: {
    v2: { group: 'tap_body' },
    v3: { group: V3_TAP_GROUP, index: 9 }
  },
  wave: {
    v2: { group: 'tap_body' },
    v3: { group: V3_TAP_GROUP, index: 12 }
  },
  tilt_left: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 10 }
  },
  tilt_right: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 11 }
  },
  step_forward: {
    v2: { group: 'tap_body' },
    v3: { group: V3_TAP_GROUP, index: 9 }
  },
  step_back: {
    v2: { group: 'tap_body' },
    v3: { group: V3_TAP_GROUP, index: 10 }
  },
  shake_head: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 3 }
  },
  mood_happy: {
    v2: { group: 'pinch_out' },
    v3: { group: V3_TAP_GROUP, index: 1 }
  },
  mood_angry: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 3 }
  },
  mood_tired: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 6 }
  },
  mood_sleepy: {
    v2: { group: 'idle' },
    v3: { group: V3_IDLE_GROUP, index: 6 }
  },
  mood_confused: {
    v2: { group: 'shake' },
    v3: { group: V3_TAP_GROUP, index: 4 }
  }
};
