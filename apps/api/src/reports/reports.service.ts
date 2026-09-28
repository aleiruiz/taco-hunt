import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool } from "pg";
import type { z } from "zod";
import { reportSchema } from "@taco-hunt/contracts";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";

type ReportInput = z.infer<typeof reportSchema>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async create(profile: AuthenticatedProfile, input: ReportInput) {
    try {
      const targetTable = input.targetType === "spot" ? "spots" : "reviews";
      const target = await this.pool.query(
        `select id from app_private.${targetTable} where id=$1`,
        [input.targetId],
      );
      if (!target.rowCount) throw new NotFoundException("Contenido no encontrado");
      const { rows } = await this.pool.query(
        `insert into app_private.reports(reporter_id,target_type,target_id,reason,note)
         values($1,$2,$3,$4,$5)
         returning id,target_type as "targetType",target_id as "targetId",reason,status,created_at as "createdAt"`,
        [profile.id, input.targetType, input.targetId, input.reason, input.note ?? null],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("Ya existe un reporte abierto para este contenido");
      if (error instanceof NotFoundException) throw error;
      this.logger.error("Report create failed", error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
