export function listKnownProviderAuthEnvVarNames(): string[] {
  return [];
}

export function omitEnvKeysCaseInsensitive(
  env: NodeJS.ProcessEnv,
  keys: Iterable<string>,
): NodeJS.ProcessEnv {
  const lowerKeys = new Set(Array.from(keys).map((k) => k.toLowerCase()));
  if (lowerKeys.size === 0) {
    return env;
  }
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!lowerKeys.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}
