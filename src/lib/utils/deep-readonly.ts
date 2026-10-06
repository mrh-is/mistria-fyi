/** A compile-time read-only view, including collections and nested records. */
export type DeepReadonly<T> = T extends
  | bigint
  | boolean
  | null
  | number
  | string
  | symbol
  | undefined
  ? T
  : T extends ReadonlySet<infer Item>
    ? ReadonlySet<DeepReadonly<Item>>
    : T extends ReadonlyMap<infer Key, infer Value>
      ? ReadonlyMap<DeepReadonly<Key>, DeepReadonly<Value>>
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;
