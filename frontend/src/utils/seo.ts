export const setMeta = (options: { title?: string; description?: string; keywords?: string }) => {
  if (options.title) {
    document.title = `${options.title} | Artigen`;
  }

  if (options.description) {
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', options.description);
  }

  if (options.keywords) {
    let metaKw = document.querySelector('meta[name="keywords"]');
    if (!metaKw) {
      metaKw = document.createElement('meta');
      metaKw.setAttribute('name', 'keywords');
      document.head.appendChild(metaKw);
    }
    metaKw.setAttribute('content', options.keywords);
  }
};
