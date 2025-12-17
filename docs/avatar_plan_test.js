// Test Script for AvatarPlan Deep Integration
// Run this in the browser console where the Agent is active.

// 1. Test Bubble and Scale
window.runAgentPlan([
  { type: 'bubble', text: 'Testing Bubble Step!', duration: 2000 },
  { type: 'move', scale: 1.5, duration: 1000 },
  { type: 'bubble', text: 'I am BIG now!', duration: 2000 },
  { type: 'move', scale: 1.0, duration: 1000 },
  { type: 'bubble', text: 'Back to normal.', duration: 2000 }
]);

// 2. Test Immediate Teleport
// window.runAgentPlan([
//   { type: 'bubble', text: 'Teleporting in 3...', duration: 1000 },
//   { type: 'bubble', text: '2...', duration: 1000 },
//   { type: 'bubble', text: '1...', duration: 1000 },
//   { type: 'move', x: '10%', y: '10%', immediate: true },
//   { type: 'bubble', text: 'Teleported!', duration: 2000 },
//   { type: 'move', x: '80%', y: '80%', duration: 2000 } // Slide back
// ]);

// 3. Test Event Emission
// window.addEventListener('agent-event', (e) => console.log('Agent Event:', e.detail));
// window.runAgentPlan([
//   { type: 'event', name: 'custom-trigger', payload: { foo: 'bar' } },
//   { type: 'console', message: 'Event fired!' }
// ]);

// 4. Complex Sequence
// window.runAgentPlan([
//   { type: 'pose', motion: 'tap_body', expression: 'happy', duration: 3000 },
//   { type: 'speak', text: 'Look at me go!', motion: 'shake' },
//   { type: 'move', x: '50%', y: '50%', scale: 1.2, duration: 2000, parallel: true },
//   { type: 'wait', duration: 2000 },
//   { type: 'expression', expression: 'shy', duration: 2000 },
//   { type: 'speak', text: 'I am in the center now.' }
// ]);
