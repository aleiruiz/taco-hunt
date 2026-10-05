import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { PlacesService } from "./places.service.js";

@Controller("/places")
@UseGuards(AuthRequiredGuard)
export class PlacesAutocompleteController {
  constructor(@Inject(PlacesService) private readonly places: PlacesService) {}

  @Get("/autocomplete")
  autocomplete(@CurrentProfile() profile: AuthenticatedProfile, @Query("q") q?: string) {
    if (!q) throw new BadRequestException("q requerido");
    return this.places.autocomplete(q, profile.id);
  }

  @Get("/:placeId/resolve")
  resolve(@CurrentProfile() profile: AuthenticatedProfile, @Param("placeId") placeId: string) {
    return this.places.resolvePlace(placeId, profile.id);
  }
}
