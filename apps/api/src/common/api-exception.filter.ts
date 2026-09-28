import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { randomUUID } from "node:crypto";

const codeByStatus: Partial<Record<number, string>> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "SERVICE_UNAVAILABLE",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<{
      id?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const response = context.getResponse();
    const headerRequestId = request.headers?.["x-request-id"];
    const requestId =
      request.id ??
      (typeof headerRequestId === "string" && /^[\w.-]{1,100}$/.test(headerRequestId)
        ? headerRequestId
        : randomUUID());
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) this.logger.error(`Unhandled request failure (${requestId})`);

    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? (payload as { message?: unknown }).message
        : undefined;
    const safeMessage =
      status >= 500
        ? "Servicio temporalmente no disponible"
        : typeof message === "string"
          ? message
          : Array.isArray(message)
            ? "Parámetros inválidos"
            : exception instanceof HttpException
              ? exception.message
              : "Error interno";
    const details =
      typeof payload === "object" && payload !== null && "details" in payload
        ? (payload as { details?: unknown }).details
        : undefined;

    this.adapterHost.httpAdapter.reply(
      response,
      {
        error: {
          code: codeByStatus[status] ?? "INTERNAL_ERROR",
          message: safeMessage,
          requestId,
          ...(details && typeof details === "object" ? { details } : {}),
        },
      },
      status,
    );
  }
}
