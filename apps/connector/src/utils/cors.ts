const ALLOWED_ORIGIN_REGEXES = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/t128n\.github\.io$/,
];

/**
 * Validates if the given origin is allowed under the security policy.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGIN_REGEXES.some((regex) => regex.test(origin));
}
