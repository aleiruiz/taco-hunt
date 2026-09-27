import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true }),
  );

  app.enableCors({ origin: true });
  app.setGlobalPrefix("v1", { exclude: ["healthz"] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
