const MAX_FAILURE_LOG_CHARACTERS = 16_000;

export function failureLogExcerpt(contents: string): string {
  if (contents.length <= MAX_FAILURE_LOG_CHARACTERS) return contents;
  return `[... verification output truncated to last ${MAX_FAILURE_LOG_CHARACTERS} characters ...]\n${contents.slice(-MAX_FAILURE_LOG_CHARACTERS)}`;
}
