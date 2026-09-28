import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard.js";
import { PlacesService, placesDiscoverySchema } from "./places.service.js";

@Controller("/admin/places")
@UseGuards(AdminGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Post("/discover")
  discover(@Body() body: unknown) {
    const parsed = placesDiscoverySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros de descubrimiento inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    return this.places.discover(parsed.data);
  }

  @Get("/candidates")
  queue(@Query("limit") limit?: string) {
    const parsed = Number(limit ?? 100);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException("limit debe ser un entero entre 1 y 100");
    }
    return this.places.queue(parsed);
  }
}
