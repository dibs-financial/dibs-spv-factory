/** Error that maps directly to an HTTP response. Kept SDK-free so pure modules can throw it. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}
