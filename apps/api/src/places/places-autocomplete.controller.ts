import { BadRequestException, Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { ApiRequest } from "../auth/auth.types.js";
import { PlacesService } from "./places.service.js";

@Controller("/places")
export class PlacesAutocompleteController {
  constructor(@Inject(PlacesService) private readonly places: PlacesService) {}

  @Get("/autocomplete")
  autocomplete(@Req() request: ApiRequest, @Query("q") q?: string) {
    if (!q) throw new BadRequestException("q requerido");
    return this.places.autocomplete(q, request.user?.id, request.ip);
  }

  @Get("/:placeId/resolve")
  resolve(@Req() request: ApiRequest, @Param("placeId") placeId: string) {
    return this.places.resolvePlace(placeId, request.user?.id, request.ip);
  }
}
