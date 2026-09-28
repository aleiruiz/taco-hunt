import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { uuidSchema } from "@taco-hunt/contracts";
import { AdminGuard } from "../auth/admin.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { AdminService, type QueueKind } from "./admin.service.js";

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).default({});
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().min(1).max(512).optional(),
});

@Controller("/admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("/queue")
  queue(@Query("kind") kindValue: string) {
    if (["photos", "duplicates"].includes(kindValue)) {
      return this.admin.queue(kindValue as QueueKind);
    }
    if (!(["spots", "tacos", "reports"] as string[]).includes(kindValue)) {
      throw new BadRequestException("kind debe ser spots, tacos, reports, photos o duplicates");
    }
    return this.admin.queue(kindValue as QueueKind);
  }

  @Get("/audit")
  audit(@Query() query: Record<string, unknown>) {
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsed.error.issues },
      });
    return this.admin.auditHistory(parsed.data.limit, parsed.data.before);
  }

  @Post("/spot-proposals/:id/approve")
  approveSpot(@Param("id") id: string, @CurrentProfile() moderator: AuthenticatedProfile) {
    return this.admin.approveSpot(this.parseId(id), moderator.id);
  }

  @Post("/spot-proposals/:id/reject")
  async rejectSpot(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.rejectSpot(this.parseId(id), moderator.id, this.reason(body, true));
  }

  @Post("/spot-proposals/:id/request-changes")
  requestSpotChanges(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.requestSpotChanges(this.parseId(id), moderator.id, this.reason(body, true));
  }

  @Post("/duplicates/:id/merge")
  mergeDuplicate(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ canonicalId: uuidSchema, reason: z.string().trim().min(1).max(500) })
      .safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Datos de fusión inválidos",
        details: { issues: parsed.error.issues },
      });
    return this.admin.mergeDuplicate(
      this.parseId(id),
      parsed.data.canonicalId,
      moderator.id,
      parsed.data.reason,
    );
  }

  @Post("/taco-proposals/:id/approve")
  approveTaco(@Param("id") id: string, @CurrentProfile() moderator: AuthenticatedProfile) {
    return this.admin.approveTaco(this.parseId(id), moderator.id);
  }

  @Post("/taco-proposals/:id/reject")
  async rejectTaco(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.rejectTaco(this.parseId(id), moderator.id, this.reason(body, true));
  }

  @Post("/reviews/:id/hide")
  async hideReview(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.hideReview(this.parseId(id), moderator.id, this.reason(body));
  }

  @Post("/reviews/:id/unhide")
  async unhideReview(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.unhideReview(this.parseId(id), moderator.id, this.reason(body));
  }

  @Post("/reviews/:id/hide-photo")
  async hidePhoto(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.hidePhoto(this.parseId(id), moderator.id, this.reason(body));
  }

  @Post("/reports/:id/close")
  async closeReport(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.closeReport(this.parseId(id), moderator.id, this.reason(body));
  }

  private parseId(value: string): string {
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("Identificador inválido");
    return parsed.data;
  }

  private reason(body: unknown, required = false): string {
    const parsed = reasonSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "Motivo inválido",
        details: { issues: parsed.error.issues },
      });
    if (required && !parsed.data.reason) {
      throw new BadRequestException("Se requiere un motivo interno para rechazar una propuesta");
    }
    return parsed.data.reason ?? "Acción de moderación";
  }
}
