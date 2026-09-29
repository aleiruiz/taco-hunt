import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL?.trim();
    const key =
      process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    this.client =
      url && key
        ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
        : null;
  }

  /**
   * Deletes the Supabase Auth user, cascading in Postgres to app_private.profiles and,
   * from there, to every row that references it (hard-delete or anonymize per each
   * table's own on-delete rule). An already-deleted user is treated as success so a
   * retried request stays safe.
   */
  async deleteUser(userId: string): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableException("La eliminación de cuentas no está configurada");
    }
    // Explicit hard delete: a soft delete would leave the auth.users row in place and
    // never trigger the on-delete rules the rest of this deletion relies on.
    const { error } = await this.client.auth.admin.deleteUser(userId, false);
    if (error && !this.isAlreadyDeleted(error)) {
      this.logger.error(`Supabase Auth user deletion failed: ${error.message}`);
      throw new ServiceUnavailableException("No pudimos eliminar tu cuenta. Intenta de nuevo.");
    }
  }

  private isAlreadyDeleted(error: { status?: number; message?: string }): boolean {
    return error.status === 404 || /user not found/i.test(error.message ?? "");
  }
}
