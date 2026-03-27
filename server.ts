import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Figma OAuth Endpoints
const FIGMA_CLIENT_ID = process.env.FIGMA_CLIENT_ID;
const FIGMA_CLIENT_SECRET = process.env.FIGMA_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.APP_URL}/api/auth/callback`;

app.get("/api/auth/url", (req, res) => {
  const scope = "file_read";
  const state = Math.random().toString(36).substring(7);
  const authUrl = `https://www.figma.com/oauth?client_id=${FIGMA_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}&state=${state}&response_type=code`;
  res.json({ url: authUrl });
});

app.get("/api/auth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post("https://www.figma.com/api/oauth/token", {
      client_id: FIGMA_CLIENT_ID,
      client_secret: FIGMA_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
      grant_type: "authorization_code",
    });

    const { access_token } = response.data;
    
    // In a real app, we'd store this in a secure session/cookie
    // For this demo, we'll redirect back to the app with the token in the URL (not secure for prod, but works for this demo context)
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({ type: 'FIGMA_AUTH_SUCCESS', token: '${access_token}' }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Figma OAuth Error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Proxy to Figma API to avoid CORS
app.get("/api/figma/files/:key", async (req, res) => {
  const { key } = req.params;
  const token = req.headers.authorization;

  try {
    const response = await axios.get(`https://api.figma.com/v1/files/${key}`, {
      headers: { Authorization: token },
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch file" });
  }
});

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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
