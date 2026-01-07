export const revokeUrl = (url: string | null) => {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => revokeUrl(url), 0);
};
