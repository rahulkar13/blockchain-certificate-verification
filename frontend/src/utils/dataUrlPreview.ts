const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character] || character;
  });

export const openDataUrlPreview = (
  dataUrl?: string,
  fileName = "Uploaded proof"
) => {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return false;
  }

  const title = escapeHtml(fileName || "Uploaded proof");
  const previewSource = escapeHtml(dataUrl);
  const isImage = /^data:image\//i.test(dataUrl);
  const previewMarkup = isImage
    ? `<img src="${previewSource}" alt="${title}" />`
    : `<iframe src="${previewSource}" title="${title}"></iframe>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --background: #020a08;
      --card: #071910;
      --border: #194532;
      --text: #e8fff4;
      --muted: #9cb8aa;
      --green: #22c55e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 20% 10%, rgba(34, 197, 94, 0.18), transparent 28rem),
        linear-gradient(180deg, #020a08, #071420);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      background: rgba(7, 25, 16, 0.88);
      position: sticky;
      top: 0;
    }
    h1 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.35;
      word-break: break-word;
    }
    a {
      border: 1px solid rgba(34, 197, 94, 0.45);
      border-radius: 0.5rem;
      color: var(--green);
      padding: 0.55rem 0.85rem;
      text-decoration: none;
      white-space: nowrap;
    }
    main {
      min-height: calc(100vh - 4.25rem);
      display: grid;
      place-items: center;
      padding: 1.25rem;
    }
    .preview {
      width: min(100%, 1100px);
      min-height: 70vh;
      display: grid;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: rgba(7, 25, 16, 0.72);
      overflow: hidden;
    }
    img {
      display: block;
      max-width: 100%;
      max-height: 82vh;
      object-fit: contain;
    }
    iframe {
      width: 100%;
      min-height: 82vh;
      border: 0;
      background: white;
    }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <a href="${previewSource}" download="${title}">Download</a>
  </header>
  <main>
    <div class="preview">${previewMarkup}</div>
  </main>
</body>
</html>`;

  const previewUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const previewWindow = window.open(previewUrl, "_blank");

  if (!previewWindow) {
    URL.revokeObjectURL(previewUrl);
    return false;
  }

  previewWindow.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  return true;
};
