import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller.js";
import { AvatarReviewService } from "./avatar-review.service.js";
import { ProfileController } from "./profile.controller.js";
import { SupabaseAdminService } from "./supabase-admin.service.js";

@Module({
  controllers: [AccountController, ProfileController],
  providers: [SupabaseAdminService, AvatarReviewService],
})
export class AccountModule {}
