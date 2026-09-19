import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { readConfig } from './config.js';
import { createResolveForgeMcpServer } from './mcp-server.js';
import { createResolveForgeService } from './service.js';

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function handleMcp(
  request: IncomingMessage,
  response: ServerResponse,
  service: ReturnType<typeof createResolveForgeService>,
) {
  const server = createResolveForgeMcpServer(service);
  const transport = new StreamableHTTPServerTransport({});
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown MCP transport error.';
    if (!response.headersSent) {
      writeJson(response, 500, { error: message });
    }
  } finally {
    await transport.close();
    await server.close();
  }
}

const config = readConfig();
const service = createResolveForgeService(config);
const httpServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  if (request.method === 'GET' && url.pathname === '/healthz') {
    writeJson(response, 200, { integration_mode: config.integrationMode, status: 'ok' });
    return;
  }
  if (url.pathname !== '/mcp') {
    writeJson(response, 404, { error: 'Not found.' });
    return;
  }
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: 'MCP requests must use POST.' });
    return;
  }
  void handleMcp(request, response, service);
});

httpServer.listen(config.port, '127.0.0.1', () => {
  process.stdout.write(`ResolveForge MCP service listening on http://127.0.0.1:${String(config.port)}/mcp\n`);
});
