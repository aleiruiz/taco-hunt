import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import type { z } from "zod";
import { spotProposalSchema, tacoProposalSchema } from "@taco-hunt/contracts";
import { classifyDuplicate, duplicateCandidateSql, normalizeName } from "./duplicate-detector.js";

type SpotProposal = z.infer<typeof spotProposalSchema>;
type TacoProposal = z.infer<typeof tacoProposalSchema>;

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Creates a pending spot for the profile and returns nearby approved candidates.
   * @throws {ConflictException} If a spot within 100 meters has the same normalized name.
   * @throws {ServiceUnavailableException} If the database operation fails.
   */
  async createSpot(profile: AuthenticatedProfile, input: SpotProposal) {
    try {
      const normalizedName = normalizeName(input.name);
      const candidates = await this.pool.query(duplicateCandidateSql(), [
        normalizedName,
        input.latitude,
        input.longitude,
      ]);
      const duplicateCandidates = candidates.rows.map((candidate) => ({
        ...candidate,
        match: classifyDuplicate(input.name, candidate.name),
      }));
      if (candidates.rowCount) {
        const exactMatch = duplicateCandidates.some((candidate) => candidate.match === "strong");
        if (exactMatch) {
          throw new ConflictException({
            message: "Hay un puesto con el mismo nombre a menos de 100 metros",
            details: { candidates: duplicateCandidates },
          });
        }
      }

      const { rows } = await this.pool.query(
        `insert into app_private.spots
          (name,normalized_name,neighborhood,latitude,longitude,status,created_by,source_type,source_ref,proposal_note)
         values ($1,$2,$3,$4,$5,'pending',$6,'user',$7,$8)
         returning id,name,neighborhood,latitude::float8 as latitude,
           longitude::float8 as longitude,status,created_at as "createdAt"`,
        [
          input.name,
          normalizedName,
          input.neighborhood,
          input.latitude,
          input.longitude,
          profile.id,
          input.sourceRef ? `${input.source}:${input.sourceRef}` : `user:${input.source}`,
          input.note ?? null,
        ],
      );
      return { ...rows[0], nearbyCandidates: duplicateCandidates };
    } catch (error) {
      this.rethrowExpected(error);
      this.logFailure("Spot proposal create failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  async createTaco(profile: AuthenticatedProfile, input: TacoProposal) {
    try {
      const spot = await this.pool.query(
        "select id from app_private.spots where id=$1 and status='approved'",
        [input.spotId],
      );
      if (!spot.rowCount) throw new NotFoundException("Puesto no encontrado");
      const tacoType = await this.pool.query(
        "select id from app_private.taco_types where id=$1 and active",
        [input.tacoTypeId],
      );
      if (!tacoType.rowCount) throw new NotFoundException("Tipo de taco no encontrado");
      const { rows } = await this.pool.query(
        `insert into app_private.spot_tacos (spot_id,taco_type_id,display_name,status,created_by)
         values ($1,$2,$3,'pending',$4)
         returning id,spot_id as "spotId",taco_type_id as "tacoTypeId",display_name as "displayName",status,created_at as "createdAt"`,
        [input.spotId, input.tacoTypeId, input.displayName ?? null, profile.id],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Ya existe una propuesta o tipo de taco para este puesto");
      }
      this.rethrowExpected(error);
      this.logFailure("Taco proposal create failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  async listMine(profile: AuthenticatedProfile) {
    try {
      const [spots, tacos] = await Promise.all([
        this.pool.query(
          `select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude,
           proposal_note as note,status,created_at as "createdAt"
         from app_private.spots where created_by=$1 order by created_at desc limit 100`,
          [profile.id],
        ),
        this.pool.query(
          `select st.id,st.spot_id as "spotId",s.name as "spotName",st.taco_type_id as "tacoTypeId",
             coalesce(st.display_name,tt.name_es) as name,st.status,st.created_at as "createdAt"
           from app_private.spot_tacos st join app_private.spots s on s.id=st.spot_id
           join app_private.taco_types tt on tt.id=st.taco_type_id
           where st.created_by=$1 order by st.created_at desc limit 100`,
          [profile.id],
        ),
      ]);
      return { spotProposals: spots.rows, tacoProposals: tacos.rows };
    } catch (error) {
      this.logFailure("Own proposal list query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private rethrowExpected(error: unknown): void {
    if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
  }

  private logFailure(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
