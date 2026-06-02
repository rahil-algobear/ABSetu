/** Simple English pluralizer for display names. */
export function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
    return word.slice(0, -1) + "ies";
  }
  if (
    word.endsWith("s") ||
    word.endsWith("x") ||
    word.endsWith("z") ||
    word.endsWith("sh") ||
    word.endsWith("ch")
  ) {
    return word + "es";
  }
  return word + "s";
}
