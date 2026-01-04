export type LocalChatCommand =
  | {
      id: 'cancel_task';
      responseText: string;
    }
  | {
      id: 'hurry';
      responseText: string;
      systemEventText: string;
      effects: {
        poutingMs?: number;
        motion?: { name: string; durationMs: number };
        bubbleMs?: number;
      };
    };

const matchByLang = (input: { text: string; lang: 'zh' | 'en'; zh: RegExp; en: RegExp }) => {
  const re = input.lang === 'zh' ? input.zh : input.en;
  return re.test(input.text);
};

export function matchLocalChatCommand(input: {
  text: string;
  lang: 'zh' | 'en';
  agentType: 'cubism3' | 'cubism2' | 'vrm';
  isExecuting: boolean;
  personaText: string;
}): LocalChatCommand | null {
  const trimmed = String(input.text || '').trim();
  if (!trimmed) return null;

  const isCancel = matchByLang({
    text: trimmed,
    lang: input.lang,
    zh: /(取消|停止|结束任务|别做了|停下)/i,
    en: /(cancel|stop task|stop doing|abort|never mind)/i
  });
  if (isCancel) {
    return {
      id: 'cancel_task',
      responseText: input.lang === 'zh' ? '好，我先停下。' : "Okay, I'll stop."
    };
  }

  const isHurry = matchByLang({
    text: trimmed,
    lang: input.lang,
    zh: /(快点|快一点|快些|赶快|加快|速度|快啊)/i,
    en: /(hurry|faster|speed up|quick|go faster)/i
  });
  if (isHurry && input.agentType === 'vrm' && !input.isExecuting) {
    const persona = String(input.personaText || '');
    const isLazyOrTsundere = /(懒散|慵懒|lazy|sleepy|tired|傲娇|tsundere)/i.test(persona);
    if (isLazyOrTsundere) {
      return {
        id: 'hurry',
        responseText:
          input.lang === 'zh' ? 'baka！这已经很快啦！' : "Baka! I'm already going fast!",
        systemEventText: '[System Event: User asked you to hurry.]',
        effects: {
          poutingMs: 1800,
          motion: { name: 'shake_head', durationMs: 1200 },
          bubbleMs: 1600
        }
      };
    }
  }

  return null;
}
