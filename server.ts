import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import app from "./api/app.js";
import { getDevLogDir, isDevLoggingEnabled } from "./api/devLogger.js";

const PORT = 3000;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BuildMe server running on http://localhost:${PORT}`);
    if (isDevLoggingEnabled()) {
      console.log(`Dev logs → ${getDevLogDir()} (today: buildme-${new Date().toISOString().slice(0, 10)}.log)`);
      console.log(`Recent logs API → http://localhost:${PORT}/api/dev/logs`);
    }
  });
}

startServer();
