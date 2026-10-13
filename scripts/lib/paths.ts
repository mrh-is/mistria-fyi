import path from "node:path";

/** Converts a filesystem path to the repository's platform-independent separator convention. */
export function toPosixPath(value: string, flavor = path): string {
  return value.split(flavor.sep).join("/");
}

/** Includes the target itself, but excludes siblings, parent traversals, & other Windows drives. */
export function isInside(directory: string, target: string, flavor = path): boolean {
  const offset = flavor.relative(target, directory);
  return offset !== ".." && !offset.startsWith(`..${flavor.sep}`) && !flavor.isAbsolute(offset);
}
