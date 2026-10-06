import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";

@Injectable()
export class AuthRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (!request.user) {
      // Keep the precise reason ("Token inválido", "Esta cuenta ya no existe") when a token
      // was presented but AuthContextGuard rejected it.
      throw request.authRejection ?? new UnauthorizedException("Se requiere iniciar sesión");
    }
    return true;
  }
}
