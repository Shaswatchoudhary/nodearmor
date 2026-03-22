// src/index.ts — final version, all four modules exported
export { envault } from "./env";
export { hash, verify, needsRehash } from "./hash";
export { guard, guardAll, createGuard } from "./guard";
export {
  ApiError, isApiError, toResponse, createError,
  BadRequest, Unauthorized, PaymentRequired, Forbidden,
  NotFound, MethodNotAllowed, Conflict, Gone,
  UnprocessableEntity, TooManyRequests,
  InternalServerError, ServiceUnavailable,
} from "./errors";