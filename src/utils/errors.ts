export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(404, msg, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Invalid or missing API key") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, message, "FORBIDDEN");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, message, "VALIDATION_ERROR", details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

export class DlpBlockedError extends AppError {
  constructor(category: string, pattern: string) {
    super(422, `Content blocked by DLP scanner: ${category}`, "DLP_BLOCKED", {
      category,
      pattern,
    });
  }
}

export class InsufficientFundsError extends AppError {
  constructor(required: number, available: number) {
    super(
      422,
      `Insufficient funds: required ${required} microcents, available ${available} microcents`,
      "INSUFFICIENT_FUNDS",
      { required, available }
    );
  }
}
