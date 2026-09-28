import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { HealthController } from "./health/health.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { SpotsController } from "./spots/spots.controller.js";
import { AuthModule } from "./auth/auth.module.js";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [HealthController, SpotsController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
