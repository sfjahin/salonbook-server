import { Router } from "express"

import { collections } from "../config/db.js"
import { requireAdmin, requireAuth } from "../middleware/auth.js"
import { asyncHandler, badRequest, notFoundError } from "../middleware/error.js"
import { asObjectIdOrNull, plainId } from "../utils/ids.js"

const router = Router()

function publicUser(doc) {
  return {
    id: plainId(doc._id),
    name: doc.name ?? "",
    email: doc.email ?? "",
    image: doc.image ?? null,
    phone: doc.phone ?? null,
    role: doc.role === "admin" ? "admin" : "user",
    blocked: Boolean(doc.banned),
    emailVerified: Boolean(doc.emailVerified),
    createdAt: doc.createdAt ?? null,
  }
}

/** GET /api/users -- administrators only. */
router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { users } = await collections()

    const rows = await users
      .find({})
      .sort({ createdAt: -1 })
      .project({
        name: 1,
        email: 1,
        image: 1,
        phone: 1,
        role: 1,
        banned: 1,
        emailVerified: 1,
        createdAt: 1,
      })
      .toArray()

    res.json({
      success: true,
      count: rows.length,
      users: rows.map(publicUser),
    })
  })
)

/**
 * PATCH /api/users/:id/block
 * Body: { blocked: true | false }. Blocking also revokes active sessions so
 * the account cannot keep using the platform.
 */
router.patch(
  "/:id/block",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { users, sessions } = await collections()

    const _id = asObjectIdOrNull(req.params.id)
    if (!_id) throw badRequest("That user id is not valid.")

    if (String(_id) === req.user.id) {
      throw badRequest("You cannot block your own account.")
    }

    const user = await users.findOne({ _id })
    if (!user) throw notFoundError("We could not find that user.")

    if (user.role === "admin") {
      throw badRequest("Administrator accounts cannot be blocked.")
    }

    const blocked = req.body?.blocked !== false

    await users.updateOne(
      { _id },
      { $set: { banned: blocked, updatedAt: new Date() } }
    )

    if (blocked) {
      await sessions.deleteMany({
        $or: [{ userId: _id }, { userId: String(_id) }],
      })
    }

    res.json({
      success: true,
      message: blocked
        ? `${user.name} has been blocked.`
        : `${user.name} has been unblocked.`,
      user: publicUser({ ...user, banned: blocked }),
    })
  })
)

export default router
