import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { z } from "zod";
import {
  uuidSchema,
  importCandidateApproveSchema,
  importCandidateRejectSchema,
  importCandidateMergeSchema,
} from "@taco-hunt/contracts";
import { AdminGuard } from "../auth/admin.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { AdminService, type QueueKind } from "./admin.service.js";

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).default({});
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().min(1).max(512).optional(),
});
const approvalSchema = z
  .object({
    confirmOwnFields: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    neighborhood: z.string().trim().min(1).max(120).optional(),
    latitude: z.number().min(25).max(27).optional(),
    longitude: z.number().min(-101.5).max(-99).optional(),
    sourceType: z.enum(["user", "owner", "licensed", "fictional"]).optional(),
    sourceRef: z.string().trim().min(1).max(200).optional(),
    verifiedAt: z.string().datetime({ offset: true }).optional(),
    verificationNote: z.string().trim().min(1).max(500).optional(),
  })
  .default({})
  .superRefine((value, context) => {
    const canonicalFields = [value.name, value.neighborhood, value.latitude, value.longitude];
    const suppliedCanonicalFields = canonicalFields.every((field) => field !== undefined);
    const partialCanonicalFields = canonicalFields.some((field) => field !== undefined);
    if (partialCanonicalFields && !suppliedCanonicalFields) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "Los campos canónicos deben enviarse todos juntos",
      });
    }
    if (!suppliedCanonicalFields && value.confirmOwnFields !== true) {
      context.addIssue({
        code: "custom",
        path: ["confirmOwnFields"],
        message: "Confirma los campos del proponente o proporciona los campos canónicos",
      });
    }
    if (value.sourceType === "licensed" && !value.sourceRef) {
      context.addIssue({
        code: "custom",
        path: ["sourceRef"],
        message: "sourceRef es obligatorio para una fuente licenciada",
      });
    }
    if (value.sourceRef !== undefined && value.sourceType === undefined) {
      context.addIssue({
        code: "custom",
        path: ["sourceType"],
        message: "sourceType es obligatorio cuando se actualiza sourceRef",
      });
    }
  });
const duplicateQuerySchema = z.object({
  name: z.string().trim().min(2).max(120),
  latitude: z.coerce.number().min(25).max(27),
  longitude: z.coerce.number().min(-101.5).max(-99),
});

@Controller("/admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("/queue")
  queue(@Query("kind") kindValue: string) {
    const kinds: QueueKind[] = ["spots", "tacos", "reports", "photos", "duplicates", "spot-photos"];
    if (!(kinds as string[]).includes(kindValue)) {
      throw new BadRequestException(`kind debe ser uno de: ${kinds.join(", ")}`);
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

  /**
   * Validates the name and Monterrey-area coordinates for an admin duplicate search.
   * @throws {BadRequestException} If any query parameter is invalid.
   */
  @Get("/duplicate-candidates")
  duplicates(@Query() query: Record<string, unknown>) {
    const parsed = duplicateQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros de duplicados inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    return this.admin.findDuplicates(parsed.data.name, parsed.data.latitude, parsed.data.longitude);
  }

  @Get("/import-candidates")
  importCandidates(@Query("state") stateValue?: string) {
    const parsed = z.enum(["pending", "approved", "rejected"]).optional().safeParse(stateValue);
    if (!parsed.success)
      throw new BadRequestException("state debe ser pending, approved o rejected");
    return this.admin.importCandidatesQueue(parsed.data);
  }

  @Post("/import-candidates/:id/approve")
  approveImportCandidate(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    const parsed = importCandidateApproveSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Coordenadas inválidas",
        details: { issues: parsed.error.issues },
      });
    }
    return this.admin.approveImportCandidate(this.parseId(id), moderator.id, parsed.data);
  }

  @Post("/import-candidates/:id/reject")
  rejectImportCandidate(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    const parsed = importCandidateRejectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Motivo de rechazo inválido",
        details: { issues: parsed.error.issues },
      });
    }
    return this.admin.rejectImportCandidate(this.parseId(id), moderator.id, parsed.data.reason);
  }

  @Post("/import-candidates/:id/merge")
  mergeImportCandidate(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    const parsed = importCandidateMergeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos de fusión inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    return this.admin.mergeImportCandidate(
      this.parseId(id),
      moderator.id,
      parsed.data.canonicalSpotId,
      parsed.data.reason,
    );
  }

  @Post("/spot-proposals/:id/approve")
  approveSpot(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    const parsed = approvalSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos de procedencia inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    return this.admin.approveSpot(this.parseId(id), moderator.id, parsed.data);
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

  @Post("/spot-photos/:id/approve")
  approveSpotPhoto(@Param("id") id: string, @CurrentProfile() moderator: AuthenticatedProfile) {
    return this.admin.approveSpotPhoto(this.parseId(id), moderator.id);
  }

  @Post("/spot-photos/:id/reject")
  async rejectSpotPhoto(
    @Param("id") id: string,
    @CurrentProfile() moderator: AuthenticatedProfile,
    @Body() body: unknown,
  ) {
    return this.admin.rejectSpotPhoto(this.parseId(id), moderator.id, this.reason(body, true));
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
