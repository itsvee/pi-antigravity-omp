import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function imageMime(data: Buffer): string | undefined {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return "image/jpeg";
  const header = data.toString("ascii", 0, 6);
  if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return undefined;
}

/** Load bounded, project-contained references without relying on host-specific exports. */
export async function loadReferenceImages(
  cwd: string,
  paths: string[] = [],
  signal?: AbortSignal,
): Promise<{ data: string; mimeType: string }[]> {
  signal?.throwIfAborted();
  if (paths.length > 4) throw new Error("At most 4 reference images are allowed.");
  if (!paths.length) return [];
  const root = await realpath(cwd);
  const images = [];
  for (const imagePath of paths) {
    signal?.throwIfAborted();
    const target = await realpath(resolve(root, imagePath));
    const rel = relative(root, target);
    if (isAbsolute(imagePath) || !rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Error("Reference image paths must be project-relative and inside the working directory.");
    const file = await open(target, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new Error("Reference image must be a regular file.");
      if (stat.size > 10 * 1024 * 1024)
        throw new Error(`Reference image is too large: ${imagePath}. Each reference must be at most 10 MB.`);
      const data = await file.readFile({ signal });
      if (data.byteLength > 10 * 1024 * 1024)
        throw new Error(`Reference image is too large: ${imagePath}. Each reference must be at most 10 MB.`);
      const mimeType = imageMime(data);
      if (!mimeType)
        throw new Error(`Unsupported reference image: ${imagePath}. Use PNG, JPEG, WebP, or GIF.`);
      images.push({ data: data.toString("base64"), mimeType });
    } finally {
      await file.close();
    }
  }
  return images;
}
