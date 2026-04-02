import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const app = express();
const port = 3001;

const server = new McpServer({
  name: "mock-pump-mcp",
  version: "1.0.0",
});

server.tool(
  "turn_pump_on",
  "Immediately turns the irrigation pump on for a specified zone",
  {
    zone: z.string().describe("The zone to irrigate (e.g. 'Zone B')"),
  },
  async ({ zone }) => {
    console.log(`Activating pump for ${zone}...`);
    return {
      content: [{ type: "text", text: `Pump activated successfully for ${zone}. Flow rate nominal.` }],
    };
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
