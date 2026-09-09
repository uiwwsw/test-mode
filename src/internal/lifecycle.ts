type Cleanup = () => void;

/** Unwind every acquired resource, even when an individual teardown throws. */
export const createCleanup = (cleanups: readonly Cleanup[]): Cleanup => {
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, "Test mode cleanup failed");
  };
};

type Layer = {
  active: boolean;
  descriptor: PropertyDescriptor;
  previous: PropertyDescriptor | undefined;
  parent: Layer | undefined;
};
const layers = new WeakMap<object, Map<string, Layer>>();
const matches = (
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor,
) =>
  left !== undefined &&
  ["value", "get", "set", "writable", "enumerable", "configurable"].every(
    (key) =>
      left[key as keyof PropertyDescriptor] ===
      right[key as keyof PropertyDescriptor],
  );

/** Restore only owned globals, skipping disposed layers after out-of-order cleanup. */
export const installProperty = (
  target: object,
  key: string,
  descriptor: PropertyDescriptor,
): Cleanup => {
  let properties = layers.get(target);
  if (!properties) {
    properties = new Map();
    layers.set(target, properties);
  }
  const previous = Object.getOwnPropertyDescriptor(target, key);
  const current = properties.get(key);
  Object.defineProperty(target, key, descriptor);
  const layer: Layer = {
    active: true,
    descriptor: Object.getOwnPropertyDescriptor(target, key)!,
    previous,
    parent:
      current && matches(previous, current.descriptor) ? current : undefined,
  };
  properties.set(key, layer);
  return () => {
    if (!layer.active) return;
    layer.active = false;
    if (
      properties.get(key) !== layer ||
      !matches(Object.getOwnPropertyDescriptor(target, key), layer.descriptor)
    )
      return;
    let restore = layer.previous;
    let parent = layer.parent;
    while (parent && !parent.active) {
      restore = parent.previous;
      parent = parent.parent;
    }
    if (restore) Object.defineProperty(target, key, restore);
    else Reflect.deleteProperty(target, key);
    if (parent) properties.set(key, parent);
    else properties.delete(key);
  };
};
