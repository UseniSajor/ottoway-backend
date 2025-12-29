import express, { Request, Response } from "express";
import { prisma } from "./lib/prisma";

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Basic service health
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    service: "ottoway-backend",
    timestamp: new Date().toISOString(),
  });
});

// DB health check (Prisma)
app.get("/db/health", async (_req: Request, res: Response) => {
  try {
    // Template literal form is important for $queryRaw
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "connected" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});
