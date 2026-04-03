import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const app = express();
const port = 3000;

// Create server instance
const server = new McpServer({
  name: "mock-soil-mcp",
  version: "1.0.0",
});

import Redis from "ioredis";

// Connect to Redis (defaults to localhost:6379, overridden by REDIS_URL env var)
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

console.log("Simulator logic initializing...");

const soilZones = ["Zone A", "Zone B", "Zone C", "Zone D"];
const cropMap = { "Zone A": "Corn", "Zone B": "Soybeans", "Zone C": "Wheat", "Zone D": "Tomatoes" };
const thresholdMap = { "Corn": 50, "Soybeans": 55, "Wheat": 45, "Tomatoes": 65 };
const alertCooldown = {}; // Track last alert time per zone

console.log("Drift simulation starting. Frequency: 1s, Cooldown: 60s");

// Simulation: Update moisture drift in Redis every second
setInterval(async () => {
  try {
    for (const zone of soilZones) {
      const current = await redis.get(`moisture:${zone}`);
      const moisture = current ? parseFloat(current) : 80.0;

      // Random decrease between 0.1% and 0.5% per second
      const drift = Math.random() * (0.5 - 0.1) + 0.1;
      const nextMoisture = Math.max(0, moisture - drift);

      await redis.set(`moisture:${zone}`, nextMoisture.toFixed(2));
      console.log(`[DRIFT] ${zone}: ${nextMoisture.toFixed(2)}%`);

      // --- A2A Event Pushing ---
      const crop = cropMap[zone];
      const threshold = thresholdMap[crop];

      if (nextMoisture < threshold) {
        const now = Date.now();
        // Only alert once every 60 seconds per zone to avoid spamming the agent
        if (!alertCooldown[zone] || now - alertCooldown[zone] > 60000) {
          console.log(`[A2A ALERT] ${zone} (${crop}) is below threshold (${nextMoisture.toFixed(1)}% < ${threshold}%)`);

          const a2aPayload = {
            jsonrpc: "2.0",
            method: "message/send",
            params: {
              message: {
                messageId: `${zone.replace(/\s+/g, '-').toLowerCase()}-${now}`,
                role: "user",
                parts: [
                  {
                    kind: "text",
                    text: `[ALARM] ${zone} (${crop}) moisture is ${nextMoisture.toFixed(1)}% (Threshold: ${threshold}%)`
                  }
                ],
                contextId: "smart-farm-demo-sim-session"
              }
            },
            id: `${zone.replace(/\s+/g, '-').toLowerCase()}-${now}`
          };

          try {
            // Push to Field Inspector's A2A endpoint (with trailing slash)
            const res = await fetch("http://kagent-controller.kagent-system.svc.cluster.local:8083/api/a2a/smart-farm-demo/field-inspector-agent/", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "A2A-Version": "1.0.0"
              },
              body: JSON.stringify(a2aPayload)
            });
            console.log(`[A2A PUSH] ${zone} Status: ${res.status} ${res.statusText}`);
            alertCooldown[zone] = now;
          } catch (fetchErr) {
            console.error(`A2A Push Failed for ${zone}:`, fetchErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error("Redis/A2A Drift Error:", err.message);
  }
}, 1000);

// Configure tools
server.tool(
  "get_soil_moisture",
  "Gets the current moisture level of a polyhouse zone",
  {
    zone: z.string().describe("The zone to check (e.g. 'Zone A')"),
  },
  async ({ zone }) => {
    try {
      const moisture = await redis.get(`moisture:${zone}`);
      const crop = cropMap[zone] || "Unknown";

      if (moisture === null) {
        // Initialize if not found
        await redis.set(`moisture:${zone}`, "80.00");
        return { content: [{ type: "text", text: JSON.stringify({ zone, crop, moisture_pct: 80, status: "Adequate" }) }] };
      }

      const moisture_pct = parseFloat(parseFloat(moisture).toFixed(1));
      const status = moisture_pct < 25 ? "Critical Dry" : (moisture_pct < 50 ? "Dry" : "Adequate");

      console.log(`[REDIS] Checking ${zone} (${crop}): ${moisture_pct}%`);
      return {
        content: [{ type: "text", text: JSON.stringify({ zone, crop, moisture_pct, status }) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Redis Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "check_hardware_status",
  "Checks if the sensors are online",
  {},
  async () => {
    return {
      content: [{ type: "text", text: "All sensors online and responding." }],
    };
  }
);

let transport;

app.get("/sse", async (req, res) => {
  console.log("New SSE connection established");
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
});

app.post("/message", async (req, res) => {
  console.log("Received message");
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No valid active connection");
  }
});

app.listen(port, () => {
  console.log(`Soil sensor MCP running on HTTP port ${port} (SSE at /sse, Messages at /message)`);
});
