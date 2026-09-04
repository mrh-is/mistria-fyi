export const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self' 'sha256-kPhtI+zxOLpZ2DoKsqwEEtEMqnJlvYy8GzMFLXnIQEc=' 'sha256-a0DjDKTAsrHq5GbdjbAHSj/FvEHVUqU9d6DCJyDGJI0=' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
] as const;

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join("; ");
