import { MongoClient } from "mongodb"
import "dotenv/config"

/**
 * Seeds the salon service menu.
 *
 * The script is idempotent: services are matched by name and updated in place,
 * so running it again never creates duplicates and never breaks appointments
 * that still reference an existing service id.
 */
const host = process.env.DB_HOST || "cluster0.q6px8ox.mongodb.net"
const uri =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${host}/`
const dbName = process.env.DB_NAME || "salonbookdb"

const IMAGES = {
  signatureCut:
    "https://i.ibb.co/bj1jY0j4/Signature-cut-style-photograph.png",
  balayage:
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80",
  facial:
    "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=80",
  manicure:
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80",
  massage:
    "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80",
  makeup:
    "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80",
}

/**
 * Menu order matches the salon's catalogue. The listing sorts by createdAt
 * descending, so the first card gets the newest timestamp.
 */
const SERVICES = [
  {
    serviceName: "Signature cut & style",
    category: "Hair",
    description:
      "An unhurried consultation, a nourishing wash, a precision cut and a finish you'll love. Our stylists work with your natural texture to create a look that feels effortless.",
    image: IMAGES.signatureCut,
    price: 65,
    duration: 60,
  },
  {
    serviceName: "Lived-in balayage",
    category: "Hair",
    description:
      "Hand-painted, sun-kissed colour that grows out beautifully. We blend soft, lived-in highlights through your lengths so your hair keeps its depth, movement and shine between visits.",
    image: IMAGES.balayage,
    price: 145,
    duration: 150,
  },
  {
    serviceName: "The glow facial",
    category: "Skin",
    description:
      "A calming reset for tired skin. Your therapist begins with a gentle cleanse and exfoliation, then tailors a mask and massage to leave your complexion hydrated, smooth and naturally radiant.",
    image: IMAGES.facial,
    price: 85,
    duration: 60,
  },
  {
    serviceName: "Signature manicure",
    category: "Nails",
    description:
      "Beautiful details, right to your fingertips. We shape, buff and care for your cuticles before finishing with a flawless polish in the shade you love, or a bare, healthy shine.",
    image: IMAGES.manicure,
    price: 35,
    duration: 45,
  },
  {
    serviceName: "Restore massage",
    category: "Wellness",
    description:
      "Let go of tension. Come back to you. Warm oils and steady, intuitive pressure ease tight shoulders, back and neck, leaving you feeling lighter, calmer and restored.",
    image: IMAGES.massage,
    price: 90,
    duration: 80,
  },
  {
    serviceName: "Occasion makeup",
    category: "Beauty",
    description:
      "Your best features, softly elevated. We start with skin-first prep, then build a long-wearing look that photographs beautifully and feels like you, from natural daytime glow to evening drama.",
    image: IMAGES.makeup,
    price: 75,
    duration: 60,
  },
]

const client = new MongoClient(uri)
await client.connect()

try {
  const services = client.db(dbName).collection("services")
  const now = Date.now()

  for (const [index, service] of SERVICES.entries()) {
    const createdAt = new Date(now - index * 60 * 1000)

    await services.updateOne(
      { serviceName: service.serviceName },
      {
        $set: {
          ...service,
          status: "active",
          createdAt,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )

    console.log(`seeded: ${service.serviceName}`)
  }

  const total = await services.countDocuments({})
  console.log(`done — ${total} services in ${dbName}`)
} finally {
  await client.close()
}
