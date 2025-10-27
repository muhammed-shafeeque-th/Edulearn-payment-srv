import { Metadata } from "@grpc/grpc-js";
/**
 * Extracts selected values from gRPC Metadata using a mapping object.
 *
 * @template T - A mapping from your result keys to metadata keys.
 * @param meta - The gRPC Metadata object.
 * @param def - An object whose keys are the field names you want
 *              and whose values are the corresponding metadata keys to fetch.
 * @returns An object mapping the original keys to their found string values (if present).
 *
 * @example
 * // Will attempt to extract "idempotency-key" and "user-id" from the gRPC metadata.
 * const vals = getMetadataValues(meta, { idempotency: "idempotency-key", userId: "user-id" });
 * // vals might be: { idempotency: "abc123", userId: "user-42" }
 */
export const getMetadataValues = <T extends Record<string, string>>(
  meta: Metadata,
  def: T
): { [K in keyof T]?: string } => {
  if (!meta || typeof def !== "object") return {};

  const result: { [K in keyof T]?: string } = {};

  for (const key in def) {
    // This line checks if the key is a direct property of the 'def' object (not inherited from the prototype chain).
    // If not, it skips the property. This prevents iterating over properties from the object's prototype.
    if (!Object.prototype.hasOwnProperty.call(def, key)) continue;
    const metaKey = def[key];

    let value: string | undefined;

    // gRPC Metadata style (get)
    if (typeof (meta as any).get === "function") {
      const res = (meta as any).get(metaKey);
      if (Array.isArray(res) && res.length > 0) {
        value = String(res[0]);
      }
    }

    // Fallback: plain object style (in unit tests/mock)
    if (!value && typeof meta === "object" && metaKey in meta) {
      value = String((meta as any)[metaKey]);
    }

    // Case-insensitive fallback
    if (
      !value &&
      typeof meta === "object" &&
      meta !== null &&
      Object.keys(meta).length
    ) {
      const keys = Object.keys(meta);
      const found = keys.find(
        (k) => k.toLowerCase() === metaKey.toLowerCase()
      );
      if (found) value = String((meta as any)[found]);
    }

    if (value) {
      result[key] = value;
    }
  }

  return result;
};
