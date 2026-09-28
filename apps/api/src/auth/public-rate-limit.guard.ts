import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";
import { RequestLimitService } from "./request-limit.service.js";

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(private readonly limits: RequestLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    try {
      this.limits.consume("public-ip", request.ip || "unknown", 120, 60_000);
      return true;
    } catch (error) {
      const response = context
        .switchToHttp()
        .getResponse<{ header?: (name: string, value: string) => void }>();
      if (error instanceof HttpException && error.getStatus() === 429) {
        const payload = error.getResponse();
        const retryAfterSeconds =
          typeof payload === "object" && payload !== null && "retryAfterSeconds" in payload
            ? String((payload as { retryAfterSeconds: number }).retryAfterSeconds)
            : "60";
        response.header?.("Retry-After", retryAfterSeconds);
      }
      throw error;
    }
  }
}
