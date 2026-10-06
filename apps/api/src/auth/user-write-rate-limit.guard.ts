import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";
import { RequestLimitService } from "./request-limit.service.js";

@Injectable()
export class UserWriteRateLimitGuard implements CanActivate {
  constructor(@Inject(RequestLimitService) private readonly limits: RequestLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
      return true;
    }
    const profile = request.user;
    if (!profile) {
      throw request.authRejection ?? new UnauthorizedException("Se requiere iniciar sesión");
    }

    try {
      this.limits.consume("write-ip", request.ip || "unknown", 30, 60_000);
      this.limits.consume("write-user", profile.id, 10, 60_000);
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
