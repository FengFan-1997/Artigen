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
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  // Safari/WebKit may not take ownership of a Blob URL until after the click task
  // completes. Removing the anchor and revoking immediately can cancel or crash a
  // download, especially for ZIP files on touch devices.
  window.setTimeout(() => {
    a.remove();
    revokeUrl(url);
  }, 5000);
};
