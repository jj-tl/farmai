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
    // Mapping of zones to specific crops
    const zoneCropMap = {
      "Zone A": "Corn",
      "Zone B": "Soybeans",
      "Zone C": "Wheat",
      "Zone D": "Tomatoes"
    };

    const crop = zoneCropMap[zone] || "Unknown";
    
    // Simulate real-time moisture changes (e.g., between 15% and 80%)
    // For testing, we can keep it low to trigger alerts as before
    const moisture_pct = Math.floor(Math.random() * (25 - 15 + 1) + 15); 
    const status = moisture_pct < 20 ? "Critical Dry" : "Adequate";

    console.log(`Checking moisture for ${zone} (${crop})...`);
    return {
      content: [{ type: "text", text: JSON.stringify({ zone, crop, moisture_pct, status }) }],
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
