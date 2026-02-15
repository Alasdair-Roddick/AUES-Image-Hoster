import { serve } from "bun";
import { join, normalize } from "path";

const IMAGE_DIR = join(process.cwd(), "images");
const PORT = 6654;

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") {
      return new Response("Bun Image Host Running", { status: 200 });
    }

    // Prevent directory traversal
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(IMAGE_DIR, safePath);

    try {
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        return new Response("Not Found", { status: 404 });
      }

      const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000",
        },
      });
    } catch (err) {
      return new Response("Server Error", { status: 500 });
    }
  },
});

console.log(`Image host running at http://localhost:${PORT}`);
