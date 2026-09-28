import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module.js";
import multipart from "@fastify/multipart";

function getTrustProxyHops(): number | false {
  const configured = process.env.TRUST_PROXY_HOPS?.trim();
  if (!configured) return false;
  if (!/^\d+$/.test(configured)) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }

  const hops = Number(configured);
  if (!Number.isSafeInteger(hops) || hops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }
  return hops === 0 ? false : hops;
}

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: getTrustProxyHops() }),
  );

  await app.register(multipart, {
    limits: { files: 1, fields: 0, parts: 1, fileSize: 2 * 1024 * 1024 },
  });

  app.enableCors({ origin: true });
  app.setGlobalPrefix("v1", { exclude: ["healthz"] });
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
