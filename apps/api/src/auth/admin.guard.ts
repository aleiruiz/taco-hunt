import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";
import { AuthRequiredGuard } from "./auth-required.guard.js";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AuthRequiredGuard) private readonly authRequired: AuthRequiredGuard) {}

  canActivate(context: ExecutionContext): boolean {
    this.authRequired.canActivate(context);
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (request.user?.role !== "admin")
      throw new ForbiddenException("Se requiere rol administrador");
    return true;
  }
}
