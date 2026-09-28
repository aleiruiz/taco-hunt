import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminGuard } from "./admin.guard.js";
import { AuthContextGuard } from "./auth-context.guard.js";
import { AuthRequiredGuard } from "./auth-required.guard.js";
import { JwtVerifierService } from "./jwt-verifier.service.js";
import { ProfileService } from "./profile.service.js";
import { PublicRateLimitGuard } from "./public-rate-limit.guard.js";
import { RequestLimitService } from "./request-limit.service.js";
import { UserWriteRateLimitGuard } from "./user-write-rate-limit.guard.js";

@Global()
@Module({
  providers: [
    JwtVerifierService,
    ProfileService,
    RequestLimitService,
    AuthRequiredGuard,
    AdminGuard,
    UserWriteRateLimitGuard,
    { provide: APP_GUARD, useClass: PublicRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthContextGuard },
    { provide: APP_GUARD, useClass: UserWriteRateLimitGuard },
  ],
  exports: [AuthRequiredGuard, AdminGuard, UserWriteRateLimitGuard, ProfileService],
})
export class AuthModule {}
