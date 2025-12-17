<template>
  <div
    class="agent-body"
    :class="{
      'is-moving': isMoving,
      'is-hovered': isHovered,
      'is-dizzy': isDizzy,
      'is-thinking': isThinking,
      'is-happy': isHappy,
      'is-confused': isConfused,
      'is-talking': isTalking,
      'is-angry': isAngry,
      'is-fainted': isFainted,
      'is-pouting': isPouting
    }"
  >
    <!-- Anime Girl SVG Character -->
    <div class="character-container">
      <!-- Hair Back -->
      <svg class="hair-back" viewBox="0 0 100 100">
        <path d="M20,50 Q10,80 30,90 T40,100" fill="#FFD1DC" stroke="#FFB6C1" stroke-width="2" />
        <path d="M80,50 Q90,80 70,90 T60,100" fill="#FFD1DC" stroke="#FFB6C1" stroke-width="2" />
      </svg>

      <!-- Head -->
      <div class="head">
        <div class="face">
          <!-- Blush -->
          <div class="blush left"></div>
          <div class="blush right"></div>

          <!-- Eyes -->
          <div class="eyes">
            <div class="eye left" :style="eyeStyle">
              <div v-if="isFainted" class="eye-closed">X</div>
              <div v-else class="pupil"></div>
              <div v-if="!isFainted" class="highlight"></div>
            </div>
            <div class="eye right" :style="eyeStyle">
              <div v-if="isFainted" class="eye-closed">X</div>
              <div v-else class="pupil"></div>
              <div v-if="!isFainted" class="highlight"></div>
            </div>
          </div>

          <!-- Mouth -->
          <div
            class="mouth"
            :class="{
              talking: isTalking,
              angry: isAngry,
              happy: isHappy,
              pouting: isPouting,
              fainted: isFainted
            }"
          ></div>
        </div>

        <!-- Hair Front (Bangs) -->
        <svg class="hair-front" viewBox="0 0 100 100">
          <path
            d="M20,30 Q50,10 80,30"
            fill="none"
            stroke="#FFB6C1"
            stroke-width="8"
            stroke-linecap="round"
          />
          <path
            d="M30,30 Q30,50 20,45"
            fill="none"
            stroke="#FFB6C1"
            stroke-width="4"
            stroke-linecap="round"
          />
          <path
            d="M70,30 Q70,50 80,45"
            fill="none"
            stroke="#FFB6C1"
            stroke-width="4"
            stroke-linecap="round"
          />
        </svg>

        <!-- Twin Tails (Antenna replacement) -->
        <div class="twin-tails">
          <div class="tail left"></div>
          <div class="tail right"></div>
        </div>
      </div>

      <!-- Angry Mark -->
      <div v-if="isAngry" class="angry-mark">💢</div>

      <!-- Dizzy Stars -->
      <div v-if="isDizzy || isFainted" class="dizzy-stars">
        <span>⭐</span><span>⭐</span><span>💫</span>
      </div>

      <!-- Question Mark -->
      <div v-if="isConfused" class="confused-mark">?</div>

      <!-- Sweat Drop (for Pouting/Shy) -->
      <div v-if="isPouting" class="sweat-drop">💧</div>
    </div>

    <div class="agent-shadow"></div>

    <!-- Speech Bubble -->
    <transition name="fade">
      <div v-if="isFainted" class="speech-bubble zzz">Zzz...</div>
      <div v-else-if="message" class="speech-bubble">
        {{ message }}
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue';
import type { Position } from '../types';

const props = defineProps<{
  isMoving: boolean;
  isHovered: boolean;
  isDizzy: boolean;
  isThinking?: boolean;
  isHappy?: boolean;
  isConfused?: boolean;
  isTalking?: boolean;
  isAngry?: boolean;
  isFainted?: boolean;
  isPouting?: boolean;
  message: string;
  eyeOffset: Position;
}>();

const {
  isMoving,
  isHovered,
  isDizzy,
  isThinking,
  isHappy,
  isConfused,
  isTalking,
  isAngry,
  isFainted,
  isPouting,
  message
} = toRefs(props);

const eyeStyle = computed(() => {
  if (props.isFainted) {
    return { transform: 'scale(1)', background: 'transparent', border: 'none' };
  }
  if (props.isDizzy) {
    return { transform: 'scaleY(0.1)' };
  }
  if (props.isHappy) {
    return { transform: 'scaleY(1.2)' }; // Big happy eyes
  }
  if (props.isAngry) {
    return { transform: 'translateY(2px) rotate(10deg)' }; // Angry glare
  }
  if (props.isPouting) {
    return { transform: 'translateY(1px) scaleX(1.1)' }; // Wide eyes looking away slightly
  }
  if (props.isThinking) {
    return { transform: 'translate(2px, -2px)' };
  }
  return {
    transform: `translate(${props.eyeOffset.x * 0.5}px, ${props.eyeOffset.y * 0.5}px)`
  };
});
</script>

<style scoped>
.agent-body {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.3s ease;
  z-index: 2;
  cursor: pointer;
}

/* Character Container */
.character-container {
  position: relative;
  width: 80px;
  height: 80px;
}

/* Head */
.head {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 60px;
  height: 60px;
  background: #fff0e5; /* Skin tone */
  border-radius: 50%;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  z-index: 2;
  overflow: hidden;
}

/* Face */
.face {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Eyes */
.eyes {
  position: absolute;
  top: 40%;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: space-around;
  padding: 0 10px;
  box-sizing: border-box;
}

.eye {
  width: 12px;
  height: 14px;
  background: #333;
  border-radius: 50%;
  position: relative;
  overflow: hidden;
  transition: transform 0.1s;
}

.eye .pupil {
  width: 6px;
  height: 8px;
  background: #8a2be2; /* Purple eyes */
  position: absolute;
  bottom: 0;
  left: 3px;
  border-radius: 50%;
}

.eye .highlight {
  width: 4px;
  height: 4px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
}

/* Mouth */
.mouth {
  position: absolute;
  bottom: 15%;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 4px;
  background: #ff6b6b;
  border-radius: 0 0 4px 4px;
  transition: all 0.2s;
}

.mouth.talking {
  height: 8px;
  border-radius: 50%;
  animation: talk 0.2s infinite alternate;
}

.mouth.angry {
  width: 10px;
  height: 2px;
  border-radius: 2px;
  transform: translateX(-50%) rotate(-5deg);
}

.mouth.happy {
  width: 12px;
  height: 6px;
  border-radius: 0 0 6px 6px;
}

/* Blush */
.blush {
  position: absolute;
  top: 55%;
  width: 8px;
  height: 4px;
  background: #ffb6c1;
  border-radius: 50%;
  opacity: 0.6;
}
.blush.left {
  left: 8px;
}
.blush.right {
  right: 8px;
}

/* Hair */
.hair-back,
.hair-front {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.hair-front {
  z-index: 3;
}
.hair-back {
  z-index: 1;
}

.twin-tails .tail {
  position: absolute;
  top: 20px;
  width: 20px;
  height: 50px;
  background: #ffb6c1;
  border-radius: 10px;
  z-index: 0;
}
.twin-tails .tail.left {
  left: -5px;
  transform: rotate(20deg);
}
.twin-tails .tail.right {
  right: -5px;
  transform: rotate(-20deg);
}

/* Marks */
.angry-mark {
  position: absolute;
  top: -5px;
  right: -5px;
  font-size: 20px;
  color: #ff0000;
  animation: pop 0.3s ease-out;
  z-index: 4;
}

.confused-mark {
  position: absolute;
  top: -10px;
  right: 10px;
  font-size: 24px;
  color: #333;
  font-weight: bold;
  animation: bounce 1s infinite;
  z-index: 4;
}

.dizzy-stars {
  position: absolute;
  top: -10px;
  width: 100%;
  text-align: center;
  font-size: 16px;
  animation: spin 2s infinite linear;
  z-index: 4;
}

/* Shadow */
.agent-shadow {
  position: absolute;
  bottom: -10px;
  width: 50%;
  height: 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  filter: blur(2px);
  z-index: 0;
}

/* Animations */
@keyframes talk {
  from {
    height: 4px;
  }
  to {
    height: 8px;
  }
}

@keyframes pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  80% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.agent-body.is-moving {
  animation: bounce 0.5s infinite alternate;
}
.agent-body.is-hovered {
  transform: scale(1.1);
}
.agent-body.is-angry {
  animation: shake 0.3s infinite;
}

@keyframes shake {
  0% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-2px);
  }
  75% {
    transform: translateX(2px);
  }
  100% {
    transform: translateX(0);
  }
}

@keyframes bounce {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-5px);
  }
}

.agent-body.is-fainted {
  filter: grayscale(0.5);
  transform: rotate(90deg) translateY(20px);
  transition: transform 0.5s ease-in;
}

.eye-closed {
  font-size: 8px;
  font-weight: bold;
  color: #333;
  text-align: center;
  line-height: 10px;
}

.mouth.pouting {
  width: 6px;
  height: 3px;
  border-radius: 2px;
  background: #ff8888;
  transform: translateY(-2px);
}

.mouth.fainted {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #333;
  animation: breathe 2s infinite;
}

.sweat-drop {
  position: absolute;
  top: 10px;
  right: -5px;
  font-size: 16px;
  animation: drop 1s infinite;
}

.speech-bubble.zzz {
  color: #888;
  font-style: italic;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

@keyframes drop {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(5px);
    opacity: 0;
  }
}
</style>
