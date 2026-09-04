const splitSmtpVariables = [
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASSWORD",
] as const;

export function missingAuthConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const missing = ["DATABASE_URL", "AUTH_SECRET", "EMAIL_FROM"].filter(
    (name) => !environment[name]?.trim(),
  );

  if (!environment.EMAIL_SERVER?.trim()) {
    missing.push(...splitSmtpVariables.filter((name) => !environment[name]?.trim()));
  }

  return missing;
}
