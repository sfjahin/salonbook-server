import jwt from "jsonwebtoken"
import { ObjectId } from "mongodb"
import "dotenv/config"

import { collections } from "../config/db.js"
import { forbidden, unauthorized } from "./error.js"

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable.")
  }
  return secret
}

/** Signs a short lived API token for an authenticated Better Auth user. */
export function signToken({ id, role, email, name }) {
  return jwt.sign({ sub: id, role, email, name }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  })
}

/** Reads and verifies a token without touching the database. */
export function verifyToken(token) {
  return jwt.verify(token, getSecret())
}

function extractBearer(req) {
  const header = req.headers.authorization || ""
  if (!header.startsWith("Bearer ")) return null
  return header.slice(7).trim() || null
}

/**
 * Loads the account behind a verified token.
 *
 * The database lookup keeps `role` and `banned` accurate: a blocked or
 * demoted user cannot keep using an old token.
 */
async function loadUser(payload) {
  const { users } = await collections()

  const raw = payload.sub
  const _id = typeof raw === "string" && ObjectId.isValid(raw)
    ? new ObjectId(raw)
    : raw

  const user = await users.findOne({ _id })

  if (!user) {
    throw unauthorized("This account no longer exists.")
  }
  if (user.banned) {
    throw forbidden("Your account has been blocked. Contact the salon.")
  }

  return {
    id: String(user._id),
    role: user.role === "admin" ? "admin" : "user",
    email: user.email,
    name: user.name,
    banned: Boolean(user.banned),
  }
}

/** Verifies the bearer token and protects the route. */
export async function requireAuth(req, res, next) {
  try {
    const token = extractBearer(req)
    if (!token) {
      throw unauthorized("You must be signed in to continue.")
    }

    let payload
    try {
      payload = verifyToken(token)
    } catch {
      throw unauthorized("Your session expired. Please sign in again.")
    }

    req.user = await loadUser(payload)
    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Attaches `req.user` when a valid token is present, but never rejects the
 * request. Used by public routes that behave differently for admins.
 */
export async function optionalAuth(req, res, next) {
  const token = extractBearer(req)
  if (!token) return next()

  try {
    req.user = await loadUser(verifyToken(token))
  } catch {
    req.user = undefined
  }

  next()
}

/** Only administrators may call the route. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return next(forbidden("Administrator access required."))
  }
  next()
}

/** Any signed-in non-administrator (a customer) may call the route. */
export function requireCustomer(req, res, next) {
  if (!req.user) {
    return next(unauthorized("You must be signed in to continue."))
  }
  if (req.user.role === "admin") {
    return next(forbidden("Administrators cannot book appointments."))
  }
  next()
}
