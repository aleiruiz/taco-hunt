import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RequestLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;
  private readonly maxBuckets = 10_000;

  consume(scope: string, key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const bucketKey = `${scope}:${key}`;
    let bucket = this.buckets.get(bucketKey);

    this.operations += 1;
    if (this.operations % 100 === 0 || this.buckets.size >= this.maxBuckets) {
      for (const [existingKey, existing] of this.buckets) {
        if (existing.resetAt <= now) this.buckets.delete(existingKey);
      }
      bucket = this.buckets.get(bucketKey);
    }

    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maxBuckets) this.reject(windowMs);
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(bucketKey, bucket);
    }

    bucket.count += 1;
    if (bucket.count > limit) this.reject(bucket.resetAt - now);
  }

  private reject(retryAfterMs: number): never {
    throw new HttpException(
      {
        message: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
