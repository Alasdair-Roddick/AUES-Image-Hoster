import { serve } from "bun";
import { join, normalize, extname } from "path";
import { readdir, unlink, mkdir } from "fs/promises";

const IMAGE_DIR = join(process.cwd(), "images");
const PORT = 6654;
const PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

await mkdir(IMAGE_DIR, { recursive: true });

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES));

function checkAuth(req: Request): boolean {
  const cookie = req.headers.get("cookie") || "";
  return cookie.includes(`token=${PASSWORD}`);
}

async function listImages(): Promise<string[]> {
  try {
    const files = await readdir(IMAGE_DIR);
    return files.filter((f) => ALLOWED_EXTENSIONS.has(extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

function renderPage(images: string[], authed: boolean, error?: string): Response {
  const host = "";
  const imageCards = images
    .map(
      (img) => `
      <div class="card">
        <img src="${host}/${encodeURIComponent(img)}" alt="${img}" loading="lazy" />
        <div class="card-info">
          <span class="name" title="${img}">${img}</span>
          <button class="copy" onclick="navigator.clipboard.writeText(location.origin+'/${encodeURIComponent(img)}')">Copy URL</button>
          <form method="POST" action="/delete" onsubmit="return confirm('Delete ${img}?')">
            <input type="hidden" name="filename" value="${img}" />
            <button type="submit" class="delete">Delete</button>
          </form>
        </div>
      </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Image Host</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#111;color:#eee;padding:1.5rem;max-width:900px;margin:0 auto}
  h1{margin-bottom:1rem;font-size:1.4rem}
  .error{background:#522;color:#faa;padding:.5rem 1rem;border-radius:6px;margin-bottom:1rem}
  .upload{background:#1a1a1a;padding:1rem;border-radius:8px;margin-bottom:1.5rem;display:flex;gap:.5rem;align-items:end;flex-wrap:wrap}
  .upload input[type=file]{flex:1;min-width:200px}
  .upload button{background:#2563eb;color:#fff;border:none;padding:.5rem 1rem;border-radius:6px;cursor:pointer}
  .upload button:hover{background:#1d4ed8}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}
  .card{background:#1a1a1a;border-radius:8px;overflow:hidden}
  .card img{width:100%;height:160px;object-fit:cover;display:block}
  .card-info{padding:.5rem;display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}
  .name{font-size:.75rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:60px}
  .copy,.delete{font-size:.7rem;padding:.25rem .5rem;border:none;border-radius:4px;cursor:pointer}
  .copy{background:#333;color:#eee}.copy:hover{background:#444}
  .delete{background:#7f1d1d;color:#fca5a5}.delete:hover{background:#991b1b}
  .login{background:#1a1a1a;padding:2rem;border-radius:8px;max-width:300px;margin:4rem auto;text-align:center}
  .login input{width:100%;padding:.5rem;margin:.5rem 0;border-radius:6px;border:1px solid #333;background:#222;color:#eee}
  .login button{background:#2563eb;color:#fff;border:none;padding:.5rem 1.5rem;border-radius:6px;cursor:pointer;margin-top:.5rem}
  .empty{color:#666;text-align:center;padding:3rem}
</style></head><body>
${
  !authed
    ? `<div class="login">
        <h1>Login</h1>
        ${error ? `<div class="error">${error}</div>` : ""}
        <form method="POST" action="/login">
          <input type="password" name="password" placeholder="Password" autofocus />
          <button type="submit">Enter</button>
        </form>
      </div>`
    : `<h1>Image Host</h1>
      ${error ? `<div class="error">${error}</div>` : ""}
      <form class="upload" method="POST" action="/upload" enctype="multipart/form-data">
        <input type="file" name="file" accept="image/*" required />
        <button type="submit">Upload</button>
      </form>
      <div class="grid">${imageCards || '<div class="empty">No images yet</div>'}</div>`
}
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

serve({
  port: PORT,
  maxRequestBodySize: 50 * 1024 * 1024,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);

    // Login
    if (pathname === "/login" && req.method === "POST") {
      const form = await req.formData();
      const pw = form.get("password")?.toString() || "";
      if (pw === PASSWORD) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/",
            "Set-Cookie": `token=${PASSWORD}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
          },
        });
      }
      return renderPage([], false, "Wrong password");
    }

    // Homepage
    if (pathname === "/") {
      const authed = checkAuth(req);
      const images = authed ? await listImages() : [];
      return renderPage(images, authed);
    }

    // Upload
    if (pathname === "/upload" && req.method === "POST") {
      if (!checkAuth(req)) return new Response(null, { status: 302, headers: { Location: "/" } });
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file || !file.name) {
        const images = await listImages();
        return renderPage(images, true, "No file selected");
      }
      const ext = extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        const images = await listImages();
        return renderPage(images, true, "File type not allowed");
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      await Bun.write(join(IMAGE_DIR, safeName), file);
      return new Response(null, { status: 302, headers: { Location: "/" } });
    }

    // Delete
    if (pathname === "/delete" && req.method === "POST") {
      if (!checkAuth(req)) return new Response(null, { status: 302, headers: { Location: "/" } });
      const form = await req.formData();
      const filename = form.get("filename")?.toString() || "";
      const safeName = normalize(filename).replace(/^(\.\.[/\\])+/, "");
      if (safeName && !safeName.includes("/") && !safeName.includes("\\")) {
        try {
          await unlink(join(IMAGE_DIR, safeName));
        } catch {}
      }
      return new Response(null, { status: 302, headers: { Location: "/" } });
    }

    // Serve images (public, no auth needed)
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
    } catch {
      return new Response("Server Error", { status: 500 });
    }
  },
});

console.log(`Image host running at http://localhost:${PORT}`);
