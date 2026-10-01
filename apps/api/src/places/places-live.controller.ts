import { BadRequestException, Controller, Get, Param, Query, Req } from "@nestjs/common";
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
    return this.places.getPlaceDetails(placeId.data);
  }
}
