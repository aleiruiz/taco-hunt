import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from "@nestjs/common";
import type { ApiRequest } from "./auth.types.js";
import { JwtVerifierService } from "./jwt-verifier.service.js";
import { ProfileService } from "./profile.service.js";

/**
 * Resolves the optional bearer token into request.user. A rejected token (malformed, invalid,
 * expired, or for an account that no longer exists) does not fail public routes: the request
 * continues anonymously and the rejection is kept for AuthRequiredGuard, so a stale session on
 * the device never blocks public browsing. Blocked accounts still get 403.
 */
@Injectable()
export class AuthContextGuard implements CanActivate {
  constructor(
    @Inject(JwtVerifierService) private readonly verifier: JwtVerifierService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const authorization = request.headers.authorization;
    if (authorization === undefined) return true;

    try {
      if (typeof authorization !== "string") throw new UnauthorizedException("Token inválido");
      const match = /^Bearer ([^\s]+)$/i.exec(authorization);
      if (!match) throw new UnauthorizedException("Token inválido");
      const { subject, signupDisplayName } = await this.verifier.verifyAccessToken(match[1]!);
      request.user = await this.profiles.findOrCreate(subject, signupDisplayName);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      request.authRejection = error;
    }
    return true;
  }
}
