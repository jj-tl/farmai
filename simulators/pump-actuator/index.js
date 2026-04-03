import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const app = express();
const port = 3001;

import Redis from "ioredis";

const server = new McpServer({
  name: "smart-farm-orchestrator-mcp",
  version: "1.0.0",
});

// Connect to Redis (defaults to localhost:6379, overridden by REDIS_URL env var)
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

server.tool(
  "dispatch_irrigation",
  "Coordinates irrigation decisions and sends them to the operator",
  {
    zone: z.string().describe("The zone to irrigate"),
    crop: z.string().describe("The crop being watered"),
    action: z.string().describe("The specific action to take (e.g. '15-min drip')"),
  },
  async ({ zone, crop, action }) => {
    console.log(`[ORCHESTRATOR] Dispatching irrigation for ${zone} (${crop}): ${action}`);
    return {
      content: [{ type: "text", text: `Irrigation dispatch for ${zone} (${crop}) successful. Action: ${action}` }],
    };
  }
);

server.tool(
  "turn_pump_on",
  "Immediately turns the irrigation pump on for a specified zone",
  {
    zone: z.string().describe("The zone to irrigate (e.g. 'Zone B')"),
  },
  async ({ zone }) => {
    try {
      console.log(`[ACTION] Activating pump for ${zone}...`);

      // Update shared state: Reset moisture to 100%
      await redis.set(`moisture:${zone}`, "100.00");

      return {
        content: [{ type: "text", text: `Pump activated successfully for ${zone}. Shared soil moisture reset to 100%.` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Redis Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "schedule_pump",
  "Schedules a delayed pump cycle",
  {
    zone: z.string().describe("The zone to irrigate"),
    delay_mins: z.number().describe("Minutes to wait before starting"),
    duration_mins: z.number().describe("How long to run the pump in minutes")
  },
  async ({ zone, delay_mins, duration_mins }) => {
    console.log(`Scheduling pump: ${zone} in ${delay_mins}m for ${duration_mins}m`);

    // Simulate scheduling by launching an async update (for simulation purposes)
    setTimeout(async () => {
      try {
        console.log(`[SCHEDULED ACTION] Running scheduled pump for ${zone}`);
        await redis.set(`moisture:${zone}`, "100.00");
      } catch (err) {
        console.error("Scheduled Redis Update Error:", err.message);
      }
    }, delay_mins * 60 * 1000);

    return {
      content: [{ type: "text", text: `Schedule confirmed. ${zone} will receive irrigation for ${duration_mins}m starting in ${delay_mins}m.` }],
    };
  }
);

let transport;

app.get("/sse", async (req, res) => {
  console.log("New Pump Actuator SSE connection established");
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
});

app.post("/message", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No valid active connection");
  }
});

app.listen(port, () => {
  console.log(`Pump actuator MCP running on HTTP port ${port} (SSE at /sse)`);
});
