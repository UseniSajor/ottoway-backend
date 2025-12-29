import express, { Request, Response } from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import projectRoutes from "./routes/projects";
import contractorRoutes from "./routes/contractors";

const app = express();

app.set("trust proxy", 1);

// CORS Configuration
const allowedOrigins = [
  "http://localhost:5173",        // Vite dev
  "http://localhost:3000",        // Alternative dev
  process.env.FRONTEND_URL,       // Production frontend
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Basic service health
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    service: "kealee-construction-backend",
    timestamp: new Date().toISOString(),
  });
});

// DB health check (Prisma)
app.get("/db/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// API Routes
app.use("/api/projects", projectRoutes);
app.use("/api/contractors", contractorRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
  console.log(`CORS enabled for: ${allowedOrigins.join(", ")}`);
});