import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { googlePlaceIdSchema, placesViewportQuerySchema } from "@taco-hunt/contracts";
import type { ApiRequest } from "../auth/auth.types.js";
import { PlacesService } from "./places.service.js";

/** Public, transient Google Places reads used by map and stand detail screens. */
@Controller("/places")
export class PlacesLiveController {
  constructor(private readonly places: PlacesService) {}

  @Get("/viewport")
  viewport(@Query() query: Record<string, unknown>, @Req() request: ApiRequest) {
    const parsed = placesViewportQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros de viewport inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    return this.places.discoverViewport(parsed.data, request.user?.id);
  }

  @Get("/:placeId/details")
  details(@Param("placeId") rawPlaceId: string, @Req() request: ApiRequest) {
    const placeId = googlePlaceIdSchema.safeParse(rawPlaceId);
    if (!placeId.success) throw new BadRequestException("placeId inválido");
    return this.places.getPlaceDetails(placeId.data, requestOrigin(request));
  }

  @Get("/:placeId/photos/:photoToken")
  async photo(
    @Param("placeId") rawPlaceId: string,
    @Param("photoToken") photoToken: string,
    @Res() reply: FastifyReply,
  ) {
    const placeId = googlePlaceIdSchema.safeParse(rawPlaceId);
    if (!placeId.success) throw new BadRequestException("placeId inválido");
    const photo = await this.places.getPlacePhoto(placeId.data, photoToken);
    reply.header("Cache-Control", "private, max-age=300");
    return reply.type(photo.contentType).send(photo.body);
  }
}

function requestOrigin(request: ApiRequest): string {
  const forwardedProto = firstHeader(request.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "https" ? "https" : "http";
  const host = firstHeader(request.headers["host"]);
  if (!host || /[\s/\\]/.test(host)) {
    throw new ServiceUnavailableException("No se pudo construir la URL de fotos");
  }
  return `${protocol}://${host}/v1`;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  return header?.split(",", 1)[0]?.trim() || undefined;
}
