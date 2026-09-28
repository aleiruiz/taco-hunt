import { BadRequestException, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 300 * 1024;
const MAX_PIXELS = 40_000_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

@Injectable()
export class ReviewPhotoProcessor {
  async process(input: Buffer): Promise<Buffer> {
    if (input.length === 0 || input.length > MAX_INPUT_BYTES) {
      throw new BadRequestException("La foto debe pesar como máximo 2 MB");
    }
    const detected = await fileTypeFromBuffer(input);
    const declaredType = (
      await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata()
    ).format;
    const supportedFormats: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      heic: "image/heic",
      heif: "image/heif",
    };
    if (
      !detected ||
      !SUPPORTED_IMAGE_TYPES.has(detected.mime) ||
      !declaredType ||
      supportedFormats[declaredType] !== detected.mime
    ) {
      throw new BadRequestException("El archivo debe ser una imagen JPEG, PNG, WebP o HEIC válida");
    }

    try {
      const image = sharp(input, {
        failOn: "error",
        limitInputPixels: MAX_PIXELS,
        animated: false,
      });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
        throw new BadRequestException("La resolución de la foto no es válida");
      }

      for (const quality of [82, 72, 62, 52, 42]) {
        const output = await sharp(input, {
          failOn: "error",
          limitInputPixels: MAX_PIXELS,
          animated: false,
        })
          .rotate()
          .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
          .webp({ quality, effort: 4 })
          .toBuffer();
        if (output.length <= MAX_OUTPUT_BYTES) return output;
      }
      throw new BadRequestException("No se pudo comprimir la foto por debajo de 300 KB");
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("La imagen está dañada o usa un formato no válido");
    }
  }
}
