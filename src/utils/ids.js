import { ObjectId } from "mongodb"

/** Converts a path/id parameter into an ObjectId when possible. */
export function toObjectId(value) {
  if (value instanceof ObjectId) return value
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value)
  }
  return value
}

/** Accepts either form and always returns an ObjectId or null. */
export function asObjectIdOrNull(value) {
  if (value instanceof ObjectId) return value
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value)
  }
  return null
}

export function plainId(value) {
  return value == null ? null : String(value)
}
