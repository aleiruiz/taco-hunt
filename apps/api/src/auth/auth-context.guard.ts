import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";
import { JwtVerifierService } from "./jwt-verifier.service.js";
import { ProfileService } from "./profile.service.js";

@Injectable()
export class AuthContextGuard implements CanActivate {
  constructor(
    private readonly verifier: JwtVerifierService,
    private readonly profiles: ProfileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const authorization = request.headers.authorization;
    if (authorization === undefined) return true;
    if (typeof authorization !== "string") throw new UnauthorizedException("Token inválido");

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) throw new UnauthorizedException("Token inválido");
    const { subject, signupDisplayName } = await this.verifier.verifyAccessToken(match[1]!);
    request.user = await this.profiles.findOrCreate(subject, signupDisplayName);
    return true;
  }
}
