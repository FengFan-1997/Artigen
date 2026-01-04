import type { Ref } from 'vue';
import type { PersonaTraits } from './persona';

export const createLocalPersonaChatReactor = <T extends string>(input: {
  agentType: Ref<T>;
  isExecuting: Ref<boolean>;
  isFainted: Ref<boolean>;
  isDizzy: Ref<boolean>;
  isHeadHit: Ref<boolean>;
  isTired: Ref<boolean>;
  isPouting: Ref<boolean>;
  isHappy: Ref<boolean>;
  isAngry: Ref<boolean>;
  isConfused: Ref<boolean>;
  message: Ref<string>;
  currentLang: Ref<string>;
  personaTraits: Ref<PersonaTraits>;
  playMotion: (name: string, duration?: number) => void;
  setTransient: (key: string, setter: (v: boolean) => void, activeMs: number) => void;
}) => {
  return (userText: string) => {
    if (input.isFainted.value || input.isDizzy.value || input.isHeadHit.value) return;
    if (String(input.agentType.value) !== 'vrm') return;
    if (input.isExecuting.value) return;

    const t = String(userText || '').trim();
    if (!t) return;
    const tl = t.toLowerCase();
    const traits = input.personaTraits.value;

    const isCompliment = /(可爱|好看|漂亮|喜欢你|爱你|love you|cute|pretty|adorable)/i.test(tl);
    const isTease =
      /(笨蛋|baka|傻|蠢|stupid|idiot|逗你|调戏|欠揍|坏蛋)/i.test(tl) ||
      (/(摸|戳|点|拍)/i.test(tl) && /(你|头|脸|胸|身)/i.test(tl));
    const isThanks = /(谢谢|谢啦|thanks|thank you|thx)/i.test(tl);
    const isSorry = /(对不起|抱歉|sorry|apolog)/i.test(tl);
    const isSleep = /(睡觉|睡了|休息|困了|我累了|go to sleep|sleep|rest)/i.test(tl);

    if (isSleep && traits.lazy) {
      input.playMotion('mood_sleepy', 1700);
      input.setTransient('tired', (v) => (input.isTired.value = v), 9000);
      if (!input.message.value || input.message.value === 'Hmm...') {
        input.message.value =
          input.currentLang.value === 'zh' ? '嗯…那就休息一下…' : 'Mm… let’s rest a bit…';
      }
      return;
    }

    if (isCompliment) {
      if (traits.tsundere) {
        input.setTransient('pouting', (v) => (input.isPouting.value = v), 1500);
        input.setTransient('happy', (v) => (input.isHappy.value = v), 1800);
        input.playMotion('mood_happy', 1500);
        if (!input.message.value || input.message.value === 'Hmm...') {
          input.message.value =
            input.currentLang.value === 'zh'
              ? '哼…才不是因为你夸我才开心的！'
              : 'Hmph… it’s not like I’m happy!';
        }
        return;
      }
      if (traits.shy) {
        input.setTransient('pouting', (v) => (input.isPouting.value = v), 1600);
        input.playMotion('idle_touch_face', 1600);
        if (!input.message.value || input.message.value === 'Hmm...') {
          input.message.value =
            input.currentLang.value === 'zh' ? '别、别这样夸我啦…' : "D-don't praise me like that…";
        }
        return;
      }
      input.setTransient('happy', (v) => (input.isHappy.value = v), 1600);
      input.playMotion('mood_happy', 1400);
      return;
    }

    if (isTease) {
      if (traits.gentle) {
        input.setTransient('confused', (v) => (input.isConfused.value = v), 1800);
        input.playMotion('mood_confused', 1400);
        if (!input.message.value || input.message.value === 'Hmm...') {
          input.message.value =
            input.currentLang.value === 'zh'
              ? '别闹啦…我们好好说话。'
              : "Don't tease me… let's talk nicely.";
        }
        return;
      }
      input.setTransient('pouting', (v) => (input.isPouting.value = v), 1800);
      input.setTransient('angry', (v) => (input.isAngry.value = v), 1200);
      input.playMotion('mood_angry', 1400);
      if (!input.message.value || input.message.value === 'Hmm...') {
        input.message.value =
          input.currentLang.value === 'zh' ? '你、你才是笨蛋！' : "Y-you're the dummy!";
      }
      return;
    }

    if (isThanks) {
      if (traits.tsundere) {
        input.setTransient('pouting', (v) => (input.isPouting.value = v), 1200);
        input.setTransient('happy', (v) => (input.isHappy.value = v), 1200);
        input.playMotion('idle_head_tilt', 1200);
        if (!input.message.value || input.message.value === 'Hmm...') {
          input.message.value = input.currentLang.value === 'zh' ? '哼…知道就好。' : 'Hmph… good.';
        }
        return;
      }
      input.setTransient('happy', (v) => (input.isHappy.value = v), 1200);
      input.playMotion('mood_happy', 1200);
      return;
    }

    if (isSorry) {
      if (traits.strict) {
        input.setTransient('confused', (v) => (input.isConfused.value = v), 1200);
        input.playMotion('idle_hand_on_chin', 1200);
        return;
      }
      if (traits.gentle) {
        input.setTransient('happy', (v) => (input.isHappy.value = v), 1200);
        input.playMotion('idle_breathe_deep', 1200);
        if (!input.message.value || input.message.value === 'Hmm...') {
          input.message.value = input.currentLang.value === 'zh' ? '没事的。' : "It's okay.";
        }
      }
    }
  };
};

export const createLocalSystemSignalReactor = <T extends string>(input: {
  agentType: Ref<T>;
  isExecuting: Ref<boolean>;
  isFainted: Ref<boolean>;
  isHeadHit: Ref<boolean>;
  isDizzy: Ref<boolean>;
  isDragging: Ref<boolean>;
  isTalking: Ref<boolean>;
  isMoving: Ref<boolean>;
  isHappy: Ref<boolean>;
  isAngry: Ref<boolean>;
  isConfused: Ref<boolean>;
  personaTraits: Ref<PersonaTraits>;
  playMotion: (name: string, duration?: number) => void;
  setTransient: (key: string, setter: (v: boolean) => void, activeMs: number) => void;
}) => {
  let lastAt = 0;
  return (evt: { trigger: string; type: string }) => {
    if (String(input.agentType.value) !== 'vrm') return;
    if (input.isExecuting.value) return;
    const now = Date.now();
    if (now - lastAt < 2200) return;

    const busy =
      input.isFainted.value ||
      input.isHeadHit.value ||
      input.isDizzy.value ||
      input.isDragging.value ||
      input.isTalking.value ||
      input.isMoving.value;
    if (busy) return;

    const traits = input.personaTraits.value;
    if (evt.trigger === 'error' || evt.type === 'dom_error') {
      lastAt = now;
      if (traits.strict) {
        input.setTransient('angry', (v) => (input.isAngry.value = v), 1400);
        input.playMotion('mood_angry', 1500);
      } else {
        input.setTransient('confused', (v) => (input.isConfused.value = v), 1600);
        input.playMotion('mood_confused', 1500);
      }
      return;
    }
    if (evt.trigger === 'dom' || evt.type === 'dom_signal') {
      lastAt = now;
      input.setTransient('happy', (v) => (input.isHappy.value = v), 1200);
      input.playMotion('mood_happy', 1200);
    }
  };
};
