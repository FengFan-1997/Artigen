export interface Position {
  x: number;
  y: number;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
}

export type AgentState = 'idle' | 'moving' | 'hovered' | 'dizzy' | 'interacting';

export interface AgentConfig {
  size: number;
  moveInterval: number;
  lerpFactor: number;
  mouseFollowOffset: Position;
}
