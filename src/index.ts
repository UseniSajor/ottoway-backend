import express from "express";

const app = express();

// Railway / load balancers friendly
app.set("trust proxy", 1);

// Basic middleware
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check (Railway-friendly)
app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "ottoway-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// Error handler (keeps process from crashing on thrown errors)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "Internal Server Error" });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
