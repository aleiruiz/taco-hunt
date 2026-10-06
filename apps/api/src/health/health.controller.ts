import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module.js";

@Controller()
export class HealthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // Cloud Run's front end reserves `/healthz`, so production probes use `/health`.
  @Get(["/healthz", "/health"])
  async health() {
    try {
      await this.pool.query("select 1");
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }
}
