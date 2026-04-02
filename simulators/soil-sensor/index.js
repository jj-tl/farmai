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

// Configure tools
server.tool(
  "get_soil_moisture",
  "Gets the current moisture level of a polyhouse zone",
  {
    zone: z.string().describe("The zone to check (e.g. 'Zone A')"),
  },
  async ({ zone }) => {
    // Return a dynamically poor condition for testing (e.g., triggering an irrigation alert)
    console.log(`Checking moisture for ${zone}...`);
    return {
      content: [{ type: "text", text: JSON.stringify({ zone, moisture_pct: 18, status: "Critical Dry" }) }],
    };
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
