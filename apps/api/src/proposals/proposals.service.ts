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

type SpotProposal = z.infer<typeof spotProposalSchema>;
type TacoProposal = z.infer<typeof tacoProposalSchema>;

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async createSpot(profile: AuthenticatedProfile, input: SpotProposal) {
    try {
      const normalizedName = normalizeName(input.name);
      const candidates = await this.pool.query(
        `select id,name,neighborhood,
          (6371000 * 2 * asin(sqrt(least(1,
            power(sin(radians(latitude::float8-$1::float8)/2),2) +
            cos(radians($1::float8))*cos(radians(latitude::float8))*
            power(sin(radians(longitude::float8-$2::float8)/2),2)
          ))))::int as "distanceMeters"
         from app_private.spots
         where status='approved' and latitude between $1::numeric-0.001 and $1::numeric+0.001
           and longitude between $2::numeric-0.001 and $2::numeric+0.001
           and 6371000 * 2 * asin(sqrt(least(1,
             power(sin(radians(latitude::float8-$1::float8)/2),2) +
             cos(radians($1::float8))*cos(radians(latitude::float8))*
             power(sin(radians(longitude::float8-$2::float8)/2),2)
           ))) <= 100
         order by "distanceMeters",name limit 10`,
        [input.latitude, input.longitude],
      );
      if (candidates.rowCount) {
        const exactMatch = candidates.rows.some(
          (candidate) => normalizeName(candidate.name) === normalizedName,
        );
        if (exactMatch) {
          throw new ConflictException({
            message: "Hay un puesto con el mismo nombre a menos de 100 metros",
            details: { candidates: candidates.rows },
          });
        }
      }

      const { rows } = await this.pool.query(
        `insert into app_private.spots
          (name,normalized_name,neighborhood,latitude,longitude,status,created_by,source_type,proposal_note)
         values ($1,$2,$3,$4,$5,'pending',$6,'user',$7)
         returning id,name,neighborhood,latitude::float8 as latitude,
           longitude::float8 as longitude,status,created_at as "createdAt"`,
        [
          input.name,
          normalizedName,
          input.neighborhood,
          input.latitude,
          input.longitude,
          profile.id,
          input.note ?? null,
        ],
      );
      return { ...rows[0], nearbyCandidates: candidates.rows };
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

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim()
    .replace(/\s+/g, " ");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
