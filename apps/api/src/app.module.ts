import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { HealthController } from "./health/health.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { SpotsController } from "./spots/spots.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { FavoritesController } from "./favorites/favorites.controller.js";
import { ReviewsController } from "./reviews/reviews.controller.js";
import { MediaModule } from "./media/media.module.js";
import { ProposalsModule } from "./proposals/proposals.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { PlacesModule } from "./places/places.module.js";
import { ShareModule } from "./share/share.module.js";
import { AccountModule } from "./account/account.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MediaModule,
    ProposalsModule,
    ReportsModule,
    AdminModule,
    PlacesModule,
    ShareModule,
    AccountModule,
  ],
  controllers: [HealthController, SpotsController, ReviewsController, FavoritesController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
