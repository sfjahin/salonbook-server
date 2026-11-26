import cors from "cors"
import express from "express"
import "dotenv/config"

import { connectToMongoDB } from "./src/config/db.js"
import { errorHandler, notFound } from "./src/middleware/error.js"
import appointmentsRoutes from "./src/routes/appointments.routes.js"
import paymentsRoutes from "./src/routes/payments.routes.js"
import servicesRoutes from "./src/routes/services.routes.js"
import statsRoutes from "./src/routes/stats.routes.js"
import transactionsRoutes from "./src/routes/transactions.routes.js"
import uploadRoutes from "./src/routes/upload.routes.js"
import usersRoutes from "./src/routes/users.routes.js"

const app = express()
const port = process.env.PORT || 5000

// Allowed browser origins: CLIENT_URL accepts a comma separated list.
// During local development any origin is allowed so localhost, 127.0.0.1 and
// LAN addresses all work; production stays restricted to CLIENT_URL.
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const isDevelopment = process.env.NODE_ENV !== "production"

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin or non-browser requests have no Origin header.
      if (!origin) return callback(null, true)
      if (isDevelopment || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(null, false)
    },
    credentials: true,
  })
)

// The Stripe webhook must receive the untouched raw body, so it skips the
// JSON parser that every other route uses.
const jsonParser = express.json({ limit: "1mb" })
app.use((req, res, next) => {
  if (req.path === "/api/payments/webhook") return next()
  return jsonParser(req, res, next)
})

app.get("/", (req, res) => {
  res.json({ success: true, message: "SalonBook API is running." })
})

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", uptime: process.uptime() })
})

app.use("/api/services", servicesRoutes)
app.use("/api/appointments", appointmentsRoutes)
app.use("/api/transactions", transactionsRoutes)
app.use("/api/users", usersRoutes)
app.use("/api/stats", statsRoutes)
app.use("/api/payments", paymentsRoutes)
app.use("/api/upload", uploadRoutes)

app.use(notFound)
app.use(errorHandler)

// Vercel runs the exported app itself; locally we listen on a port.
if (!process.env.VERCEL) {
  connectToMongoDB()
    .then(() => {
      app.listen(port, () => {
        console.log(`SalonBook API listening on http://localhost:${port}`)
      })
    })
    .catch((error) => {
      console.error("[db] failed to connect:", error.message)
      process.exit(1)
    })
}

export default app
