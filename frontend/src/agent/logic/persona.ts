export type PersonaTraits = {
  tsundere: boolean;
  shy: boolean;
  gentle: boolean;
  strict: boolean;
  lazy: boolean;
  cheerful: boolean;
  cold: boolean;
  teasing: boolean;
  elegant: boolean;
  warrior: boolean;
  mystic: boolean;
};

export const computePersonaTraits = (personaText: string): PersonaTraits => {
  const t = String(personaText || '').toLowerCase();
  return {
    tsundere: /(傲娇|tsundere)/i.test(t),
    shy: /(害羞|腼腆|内向|shy|timid|bashful)/i.test(t),
    gentle: /(温柔|治愈|体贴|gentle|soft|kind|healing)/i.test(t),
    strict: /(勤勉|严谨|理性|认真|目标导向|strict|disciplined|rational|diligent)/i.test(t),
    lazy: /(懒散|慵懒|懒|lazy|sleepy|tired|困|疲|累)/i.test(t),
    cheerful: /(元气|活泼|开朗|随性|调皮|cheer|lively|playful|energetic)/i.test(t),
    cold: /(高冷|冷淡|沉默|寡言|quiet|cold)/i.test(t),
    teasing: /(狡黠|爱逗人|调侃|teas|mischiev)/i.test(t),
    elegant: /(优雅|高贵|端庄|从容|elegan|grace|refined|poised)/i.test(t),
    warrior: /(战斗|武|剑|弓|枪|骑士|武士|soldier|warrior|knight|fighter)/i.test(t),
    mystic: /(神秘|巫女|妖|狐|仙|魔法|mystic|mage|divine|fox)/i.test(t)
  };
};
