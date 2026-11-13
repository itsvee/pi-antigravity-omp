import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, truncate, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReferenceImages } from "../src/image/reference-images.js";

const root = await mkdtemp(join(tmpdir(), "agy-references-"));
const outside = await mkdtemp(join(tmpdir(), "agy-outside-"));
try {
  const samples = [
    ["89504e470d0a1a0a", "image/png"],
    ["ffd8ff", "image/jpeg"],
    [Buffer.from("GIF89a").toString("hex"), "image/gif"],
    [Buffer.from("RIFF0000WEBP").toString("hex"), "image/webp"],
  ];
  for (const [hex, mimeType] of samples) {
    const data = Buffer.from(hex!, "hex");
    await writeFile(join(root, "misleading.txt"), data);
    assert.deepEqual(await loadReferenceImages(root, ["misleading.txt"]), [
      { data: data.toString("base64"), mimeType },
    ]);
  }
  await writeFile(join(root, "fake.png"), "not an image");
  await assert.rejects(loadReferenceImages(root, ["fake.png"]), /Unsupported reference/);
  await writeFile(join(outside, "escape.png"), Buffer.from(samples[0]![0]!, "hex"));
  await symlink(join(outside, "escape.png"), join(root, "escape.png"));
  await assert.rejects(loadReferenceImages(root, ["escape.png"]), /inside the working directory/);
  await assert.rejects(loadReferenceImages(root, [join(outside, "escape.png")]), /project-relative/);
  await assert.rejects(loadReferenceImages(root, ["../" + outside.split("/").pop() + "/escape.png"]), /inside the working directory/);
  await assert.rejects(loadReferenceImages(root, Array(5).fill("fake.png")), /At most 4/);
  await writeFile(join(root, "large.png"), Buffer.from(samples[0]![0]!, "hex"));
  await truncate(join(root, "large.png"), 10 * 1024 * 1024 + 1);
  await assert.rejects(loadReferenceImages(root, ["large.png"]), /too large/);
  await assert.rejects(loadReferenceImages(root, ["fake.png"], AbortSignal.abort()), { name: "AbortError" });
  assert.deepEqual(await loadReferenceImages(root), []);
  console.log("reference images: signatures, path containment, size, count, cancellation passed");
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}
