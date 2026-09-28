import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller.js";
import { SupabaseAdminService } from "./supabase-admin.service.js";

@Module({ controllers: [AccountController], providers: [SupabaseAdminService] })
export class AccountModule {}
