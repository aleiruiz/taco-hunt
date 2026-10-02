import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { googlePlaceIdSchema, placesViewportQuerySchema } from "@taco-hunt/contracts";
import type { ApiRequest } from "../auth/auth.types.js";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
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
    return this.places.discoverViewport(parsed.data, request.user?.id, request.ip);
  }

  @Get("/:placeId/details")
  details(@Param("placeId") rawPlaceId: string, @Req() request: ApiRequest) {
    const placeId = googlePlaceIdSchema.safeParse(rawPlaceId);
    if (!placeId.success) throw new BadRequestException("placeId inválido");
    return this.places.getPlaceDetails(placeId.data, request.user?.id, request.ip);
  }

  @Get("/photo")
  async photo(
    @Query("name") rawName: string,
    @Req() request: ApiRequest,
    @Res() reply: FastifyReply,
  ) {
    const image = await this.places.getPlacePhoto(rawName, request.user?.id, request.ip);
    return reply
      .type(image.contentType)
      .header("Cache-Control", "public, max-age=300")
      .send(image.body);
  }

  @Post("/review-target")
  @UseGuards(AuthRequiredGuard)
  reviewTarget(
    @Body() body: unknown,
    @CurrentProfile() profile: AuthenticatedProfile,
    @Req() request: ApiRequest,
  ) {
    return this.places.createGoogleReviewTarget(body, profile.id, request.ip);
  }
}
