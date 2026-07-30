export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";

    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };

    input.click();
  });
}


export function downloadFile(
  data: string | Blob,
  filename: string,
  mimeType = "text/plain"
): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function youtubeUrlToEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId: string | null = null;

    if (parsed.hostname === 'youtu.be') {
      videoId = parsed.pathname.slice(1);
    } else if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v');
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1];
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/shorts/')[1];
      }
    }

    if (!videoId) return null;

    videoId = videoId.split('/')[0].split('?')[0];

    return `https://www.youtube.com/embed/${videoId}`;
  } catch (e) {
    return null;
  }
}

export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
}

export function randomString(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}