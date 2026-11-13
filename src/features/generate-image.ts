/**
 * Optional model-facing image tool.
 * Disable this extension resource in `pi config` to keep the Antigravity provider
 * and `/antigravity.image` without registering `generate_image`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadReferenceImages } from "../image/reference-images.js";
import { Type } from "typebox";
import {
  DEFAULT_IMAGE_MODEL,
  generateAntigravityImage,
  IMAGE_ASPECT_RATIOS,
} from "../image/index.js";
import { extraToolExposure, isExtraToolEnabled } from "../utils/index.js";

export default function (pi: ExtensionAPI): void {
  if (!isExtraToolEnabled("IMAGE")) return;
  pi.registerTool({
    ...extraToolExposure(),
    name: "generate_image",
    label: "Generate image",
    description:
      "Generate an image via Antigravity using the signed-in Google account, optionally guided by local reference images. Saves under .pi/generated-images/ unless path is set.",
    promptSnippet: "Generate images via Antigravity OAuth (Gemini image models)",
    promptGuidelines: [
      "Use generate_image when the user asks to create, draw, or generate an image.",
    ],
    parameters: Type.Object({
      prompt: Type.String({ description: "Image description." }),
      aspectRatio: Type.Optional(
        Type.Unsafe<(typeof IMAGE_ASPECT_RATIOS)[number]>({
          type: "string",
          enum: [...IMAGE_ASPECT_RATIOS],
        }),
      ),
      model: Type.Optional(
        Type.String({
          description: `Image model id. Default: ${DEFAULT_IMAGE_MODEL}.`,
        }),
      ),
      referenceImages: Type.Optional(
        Type.Array(
          Type.String({
            description: "Project-relative reference image path (PNG, JPEG, WebP, or GIF).",
          }),
          { description: "Reference images to send alongside the prompt." },
        ),
      ),
      path: Type.Optional(
        Type.String({
          description: "Project-relative file or directory to save the image.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const apiKey = await ctx.modelRegistry.getApiKeyForProvider("antigravity");
      if (!apiKey) {
        throw new Error("No Antigravity credentials. Run /login antigravity first.");
      }
      const inputImages = await loadReferenceImages(ctx.cwd, params.referenceImages, signal);
      onUpdate?.({ content: [{ type: "text", text: "Generating image…" }], details: {} });
      const result = await generateAntigravityImage({
        apiKey,
        cwd: ctx.cwd,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        model: params.model,
        path: params.path,
        inputImages,
        signal,
      });
      const notes = result.text.join(" ").trim();
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved image to ${result.savedPaths.join(", ")}${notes ? `. ${notes}` : ""}`,
          },
          ...result.images.map((image) => ({
            type: "image" as const,
            data: image.data,
            mimeType: image.mimeType,
          })),
        ],
        details: { model: result.model, savedPaths: result.savedPaths },
      };
    },
  });
}
