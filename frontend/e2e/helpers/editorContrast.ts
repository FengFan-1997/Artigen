export function editorTokenContrast(e: HTMLElement) {
  const lum = (rgb: string) => {
    const [r, g, b] = rgb
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return Array.from(e.querySelectorAll(e.matches('.cm-content') ? 'span' : '.cm-content span'))
    .filter((s) => s.textContent?.trim())
    .map((s) => {
      let p: Element | null = s;
      const layers: number[][] = [];
      while (p) {
        const layer = getComputedStyle(p)
          .backgroundColor.match(/[\d.]+/g)!
          .map(Number);
        layers.push(layer);
        if ((layer[3] ?? 1) === 1) break;
        p = p.parentElement;
      }
      // Composite transparent active-line/selection paint over the actual code surface.
      const background = layers.reverse().reduce(
        (under, layer) => {
          const alpha = layer[3] ?? 1;
          return under.map((channel, i) => layer[i] * alpha + channel * (1 - alpha));
        },
        [255, 255, 255]
      );
      const bg = `rgb(${background.join(',')})`;
      const fg = getComputedStyle(s).color;
      const a = lum(fg),
        b = lum(bg);
      return {
        text: s.textContent,
        color: fg,
        background: bg,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      };
    });
}

export function unreadableEditorTokens(
  tokens: Array<{ text: string; ratio: number }>
) {
  return tokens.filter((token) => {
    // Keep the upstream VS Code comment colors intact (4.22:1 dark, just under
    // 4.5:1 light over the active-line surface); all other syntax stays at 4.5:1.
    const isComment = /^\s*(?:\/\/|\/\*)/.test(token.text);
    return token.ratio < (isComment ? 4.2 : 4.5);
  });
}
