import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";

export const CurrentProfile = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<ApiRequest>();
  if (!request.user) {
    throw request.authRejection ?? new UnauthorizedException("Se requiere iniciar sesión");
  }
  return request.user;
});
