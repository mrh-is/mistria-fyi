import path from "node:path";

/** Converts a filesystem path to the repository's platform-independent separator convention. */
export function toPosixPath(value: string, flavor = path): string {
  return value.split(flavor.sep).join("/");
}

/** Includes the root itself, but excludes siblings, parent traversals, & other Windows drives. */
export function isInside(candidate: string, root: string, flavor = path): boolean {
  const offset = flavor.relative(root, candidate);
  return offset !== ".." && !offset.startsWith(`..${flavor.sep}`) && !flavor.isAbsolute(offset);
}
