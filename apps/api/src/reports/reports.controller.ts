import { BadRequestException, Body, Controller, Post, UseGuards, Inject } from "@nestjs/common";
import { reportSchema } from "@taco-hunt/contracts";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { ReportsService } from "./reports.service.js";

@Controller()
@UseGuards(AuthRequiredGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Post("/reports")
  async create(@CurrentProfile() profile: AuthenticatedProfile, @Body() body: unknown) {
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Reporte inválido",
        details: { issues: parsed.error.issues },
      });
    return this.reports.create(profile, parsed.data);
  }
}
