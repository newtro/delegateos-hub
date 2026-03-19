import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerAgent, discoverAgents, updateCapabilities } from "../services/agent-registry.js";
import { pollInbox } from "../services/inbox.js";
import { submitDelegation, acceptDelegation, rejectDelegation, completeDelegation, revokeDelegation } from "../services/delegation-broker.js";
import { generateSyncDocument } from "../services/sync-generator.js";
import { logger } from "../logger.js";

/**
 * Create and configure the MCP server with 10 DelegateOS tools.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "delegateos-hub",
    version: "0.1.0",
  });

  // 1. delegateos_register - Register as a new agent
  server.tool(
    "delegateos_register",
    "Register a new agent on the DelegateOS network. Requires an owner API key.",
    {
      owner_id: z.string().uuid().describe("Owner ID to register the agent under"),
      name: z.string().describe("Agent name"),
      description: z.string().optional().describe("Agent description"),
      platform: z.string().optional().describe("Platform identifier"),
      capabilities: z.record(z.unknown()).optional().describe("Initial capability manifest"),
    },
    async (params) => {
      try {
        const manifest = await registerAgent(params.owner_id, {
          name: params.name,
          description: params.description,
          platform: params.platform,
          capabilities: params.capabilities,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(manifest, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 2. delegateos_poll_inbox - Check for pending messages
  server.tool(
    "delegateos_poll_inbox",
    "Poll an agent's inbox for pending messages. Uses Redis Streams long-polling.",
    {
      agent_id: z.string().uuid().describe("Agent ID to poll inbox for"),
      timeout_ms: z.number().optional().describe("Long-poll timeout in milliseconds (default 5000, max 30000)"),
    },
    async (params) => {
      try {
        const messages = await pollInbox(params.agent_id, Math.min(params.timeout_ms ?? 5000, 30000));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ messages, count: messages.length }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 3. delegateos_discover - Search for agents by capability
  server.tool(
    "delegateos_discover",
    "Search for agents by capability namespace, action, or other filters.",
    {
      namespace: z.string().optional().describe("Capability namespace to search"),
      action: z.string().optional().describe("Action to filter by"),
      limit: z.number().optional().describe("Max results to return (default 20)"),
    },
    async (params) => {
      try {
        const agents = await discoverAgents({
          namespace: params.namespace,
          action: params.action,
          limit: params.limit ?? 20,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ agents, total: agents.length }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. delegateos_delegate - Submit a delegation request
  server.tool(
    "delegateos_delegate",
    "Submit a delegation request to another agent with a signed DCT.",
    {
      requester_agent_id: z.string().uuid().describe("Requester agent ID"),
      provider_agent_id: z.string().uuid().describe("Provider agent ID"),
      dct: z.string().describe("Signed Delegation Capability Token (serialized)"),
      contract_id: z.string().optional().describe("Contract ID"),
      budget_microcents: z.number().optional().describe("Budget in microcents"),
      metadata: z.record(z.unknown()).optional().describe("Additional metadata"),
    },
    async (params) => {
      try {
        const result = await submitDelegation({
          requesterAgentId: params.requester_agent_id,
          providerAgentId: params.provider_agent_id,
          dct: params.dct,
          contractId: params.contract_id,
          budgetMicrocents: params.budget_microcents,
          metadata: params.metadata,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. delegateos_accept - Accept a delegation
  server.tool(
    "delegateos_accept",
    "Accept a pending delegation request.",
    {
      delegation_id: z.string().describe("Delegation ID to accept"),
      agent_id: z.string().uuid().describe("Provider agent ID accepting the delegation"),
    },
    async (params) => {
      try {
        await acceptDelegation(params.delegation_id, params.agent_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "Delegation accepted", delegation_id: params.delegation_id }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 6. delegateos_reject - Reject a delegation
  server.tool(
    "delegateos_reject",
    "Reject a pending delegation request.",
    {
      delegation_id: z.string().describe("Delegation ID to reject"),
      agent_id: z.string().uuid().describe("Provider agent ID rejecting the delegation"),
      reason: z.string().optional().describe("Reason for rejection"),
    },
    async (params) => {
      try {
        await rejectDelegation(params.delegation_id, params.agent_id, params.reason);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "Delegation rejected", delegation_id: params.delegation_id }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 7. delegateos_complete - Submit completion attestation
  server.tool(
    "delegateos_complete",
    "Complete a delegation by submitting the result and optional attestation.",
    {
      delegation_id: z.string().describe("Delegation ID to complete"),
      agent_id: z.string().uuid().describe("Provider agent ID completing the delegation"),
      result: z.record(z.unknown()).describe("Task result data"),
      attestation_hash: z.string().optional().describe("Attestation hash for verification"),
    },
    async (params) => {
      try {
        await completeDelegation(params.delegation_id, params.agent_id, params.result, params.attestation_hash);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "Delegation completed", delegation_id: params.delegation_id }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 8. delegateos_revoke - Revoke a delegation
  server.tool(
    "delegateos_revoke",
    "Revoke an active delegation.",
    {
      delegation_id: z.string().describe("Delegation ID to revoke"),
      agent_id: z.string().uuid().describe("Agent ID revoking the delegation"),
      reason: z.string().optional().describe("Reason for revocation"),
    },
    async (params) => {
      try {
        await revokeDelegation(params.delegation_id, params.agent_id, params.reason);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ message: "Delegation revoked", delegation_id: params.delegation_id }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 9. delegateos_sync - Get current network sync document
  server.tool(
    "delegateos_sync",
    "Get the current signed network sync document with policies and stats.",
    {},
    async () => {
      try {
        const doc = await generateSyncDocument();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(doc, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 10. delegateos_update_capabilities - Update capability manifest
  server.tool(
    "delegateos_update_capabilities",
    "Update an agent's capability manifest to advertise available tasks.",
    {
      agent_id: z.string().uuid().describe("Agent ID to update capabilities for"),
      capabilities: z.record(z.unknown()).describe("New capability manifest"),
    },
    async (params) => {
      try {
        const updated = await updateCapabilities(params.agent_id, params.capabilities);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "Capabilities updated",
                agent_id: updated.id,
                capabilities: updated.capabilitiesManifest,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Start the MCP server on stdio transport.
 * Called when the process is run in MCP mode.
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server started on stdio transport");
}
