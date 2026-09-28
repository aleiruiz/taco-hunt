import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
  crit?: unknown;
  b64?: unknown;
}

interface JwtClaims {
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
}

interface Jwk {
  alg?: string;
  kid?: string;
  kty?: string;
  use?: string;
  [key: string]: unknown;
}

interface JwksResponse {
  keys?: Jwk[];
}

const subjectSchema = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOCK_SKEW_SECONDS = 30;

@Injectable()
export class JwtVerifierService {
  private jwksCache: { keys: Jwk[]; expiresAt: number } | undefined;
  private jwksRefresh: Promise<Jwk[]> | undefined;

  async verifyAccessToken(token: string): Promise<{ subject: string }> {
    if (token.length > 12_000) throw new UnauthorizedException("Token inválido");
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw new UnauthorizedException("Token inválido");
    }

    let header: JwtHeader;
    let claims: JwtClaims;
    let signature: Buffer;
    try {
      header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")) as JwtHeader;
      claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as JwtClaims;
      signature = Buffer.from(parts[2]!, "base64url");
    } catch {
      throw new UnauthorizedException("Token inválido");
    }

    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!(await this.isSignatureValid(header, signingInput, signature))) {
      throw new UnauthorizedException("Token inválido");
    }

    const issuer = this.getExpectedIssuer();
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== issuer ||
      !this.hasAudience(claims.aud, "authenticated") ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now - CLOCK_SKEW_SECONDS ||
      (claims.nbf !== undefined &&
        (typeof claims.nbf !== "number" ||
          !Number.isFinite(claims.nbf) ||
          claims.nbf > now + CLOCK_SKEW_SECONDS)) ||
      typeof claims.sub !== "string" ||
      !subjectSchema.test(claims.sub)
    ) {
      throw new UnauthorizedException("Token inválido");
    }

    return { subject: claims.sub };
  }

  private async isSignatureValid(
    header: JwtHeader,
    signingInput: Buffer,
    signature: Buffer,
  ): Promise<boolean> {
    if (header.typ !== undefined && header.typ !== "JWT") return false;
    if (header.crit !== undefined || (header.b64 !== undefined && header.b64 !== true))
      return false;

    if (header.alg === "HS256") {
      if (process.env.NODE_ENV === "production") return false;
      const supabaseUrl = process.env.SUPABASE_URL?.trim();
      if (!supabaseUrl || !this.isLocalIssuerUrl(supabaseUrl)) return false;
      const secret = process.env.SUPABASE_JWT_SECRET?.trim();
      if (!secret) return false;
      const expected = createHmac("sha256", secret).update(signingInput).digest();
      return signature.length === expected.length && timingSafeEqual(signature, expected);
    }

    if (header.alg !== "RS256" && header.alg !== "ES256") {
      return false;
    }
    if (header.kid !== undefined && (typeof header.kid !== "string" || header.kid.length > 200)) {
      return false;
    }

    let keys = await this.getJwks();
    let jwk = this.selectKey(keys, header);
    if (!jwk) {
      keys = await this.refreshJwks(true);
      jwk = this.selectKey(keys, header);
    }
    if (!jwk || (jwk.alg && jwk.alg !== header.alg) || (jwk.use && jwk.use !== "sig")) {
      return false;
    }

    try {
      const publicKey = createPublicKey({ key: jwk, format: "jwk" });
      if (header.alg === "RS256") return verify("RSA-SHA256", signingInput, publicKey, signature);
      if (header.alg === "ES256") {
        return verify(
          "sha256",
          signingInput,
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          signature,
        );
      }
      return false;
    } catch {
      return false;
    }
  }

  private getExpectedIssuer(): string {
    const configuredIssuer = process.env.SUPABASE_JWT_ISSUER?.trim();
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const issuer =
      configuredIssuer || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1` : "");
    if (!issuer)
      throw new ServiceUnavailableException("La verificación de identidad no está configurada");
    return issuer;
  }

  private hasAudience(aud: unknown, expected: string): boolean {
    return aud === expected || (Array.isArray(aud) && aud.includes(expected));
  }

  private selectKey(keys: Jwk[], header: JwtHeader): Jwk | undefined {
    const eligible = keys.filter(
      (candidate) =>
        (!candidate.alg || candidate.alg === header.alg) &&
        (!candidate.use || candidate.use === "sig"),
    );
    if (typeof header.kid === "string") {
      return eligible.find((candidate) => candidate.kid === header.kid);
    }
    return eligible.length === 1 ? eligible[0] : undefined;
  }

  private isLocalIssuerUrl(value: string): boolean {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    } catch {
      return false;
    }
  }

  private async getJwks(): Promise<Jwk[]> {
    if (this.jwksCache && this.jwksCache.expiresAt > Date.now()) return this.jwksCache.keys;
    return this.refreshJwks(false);
  }

  private async refreshJwks(force: boolean): Promise<Jwk[]> {
    if (!force && this.jwksRefresh) return this.jwksRefresh;
    const baseUrl = process.env.SUPABASE_URL?.trim();
    if (!baseUrl)
      throw new ServiceUnavailableException("La verificación de identidad no está configurada");

    this.jwksRefresh = (async () => {
      let endpoint: URL;
      try {
        endpoint = new URL("/auth/v1/.well-known/jwks.json", baseUrl);
      } catch {
        throw new ServiceUnavailableException("La configuración de identidad no es válida");
      }
      let response: Response;
      try {
        response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      } catch {
        throw new ServiceUnavailableException("No se pudo verificar la identidad");
      }
      if (!response.ok) throw new ServiceUnavailableException("No se pudo verificar la identidad");

      let body: JwksResponse;
      try {
        body = (await response.json()) as JwksResponse;
      } catch {
        throw new ServiceUnavailableException("La respuesta de identidad no es válida");
      }
      if (!Array.isArray(body.keys) || body.keys.length > 100) {
        throw new ServiceUnavailableException("La respuesta de identidad no es válida");
      }
      const keys = body.keys.filter(
        (key) => typeof key.kid === "string" && typeof key.kty === "string" && key.kty !== "oct",
      );
      const cacheControl = response.headers.get("cache-control") ?? "";
      const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] ?? 300);
      this.jwksCache = {
        keys,
        expiresAt: Date.now() + Math.min(maxAge, 600) * 1000,
      };
      return keys;
    })();

    try {
      return await this.jwksRefresh;
    } finally {
      this.jwksRefresh = undefined;
    }
  }
}
