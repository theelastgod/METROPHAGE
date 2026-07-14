// METROPHAGE — generate a simple share card (canvas PNG) for boss kills / milestones.
// No external APIs; downloads as a file the player can post.

export interface ShareCardInput {
  title: string;
  subtitle: string;
  detail?: string;
  accent?: string;
}

/** Render a neon-noir card and trigger browser download. Returns false if canvas fails. */
export function downloadShareCard(input: ShareCardInput): boolean {
  try {
    const w = 960;
    const h = 540;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // Background
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0a0618");
    g.addColorStop(0.5, "#120a28");
    g.addColorStop(1, "#04020a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Neon frame
    const accent = input.accent || "#ff2bd6";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 36, w - 72, h - 72);

    // Title block
    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 28px Orbitron, sans-serif";
    ctx.fillText("METROPHAGE", 64, 100);
    ctx.fillStyle = accent;
    ctx.font = "bold 48px Orbitron, sans-serif";
    wrapText(ctx, input.title.toUpperCase(), 64, 180, w - 128, 54);
    ctx.fillStyle = "#eafdff";
    ctx.font = "22px 'IBM Plex Mono', monospace";
    wrapText(ctx, input.subtitle, 64, 300, w - 128, 28);
    if (input.detail) {
      ctx.fillStyle = "#9aa3b2";
      ctx.font = "16px 'IBM Plex Mono', monospace";
      wrapText(ctx, input.detail, 64, 400, w - 128, 22);
    }
    ctx.fillStyle = "#5a6478";
    ctx.font = "14px 'IBM Plex Mono', monospace";
    ctx.fillText("metrophagev1.pages.dev", 64, h - 56);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `metrophage-${Date.now().toString(36)}.png`;
    a.click();
    return true;
  } catch {
    return false;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
