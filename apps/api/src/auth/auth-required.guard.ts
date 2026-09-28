import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";

@Injectable()
export class AuthRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (!request.user) throw new UnauthorizedException("Se requiere iniciar sesión");
    return true;
  }
}
