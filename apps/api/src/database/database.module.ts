import { Global, Module } from "@nestjs/common";
import { OnApplicationShutdown } from "@nestjs/common";
import pg from "pg";

export const DATABASE_POOL = Symbol("DATABASE_POOL");
const { Pool } = pg;

class DatabasePoolLifecycle implements OnApplicationShutdown {
  constructor(private readonly pool: InstanceType<typeof Pool>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be configured before starting the API");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  return databaseUrl;
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () =>
        new Pool({
          connectionString: getDatabaseUrl(),
          max: 5,
          connectionTimeoutMillis: 3000,
        }),
    },
    {
      provide: DatabasePoolLifecycle,
      useFactory: (pool: InstanceType<typeof Pool>) => new DatabasePoolLifecycle(pool),
      inject: [DATABASE_POOL],
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
