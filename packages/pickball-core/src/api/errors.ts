export const API_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  INVALID_BODY: "INVALID_BODY",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiErrorBody {
  error: ApiErrorCode;
}
