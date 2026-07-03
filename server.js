/**
 * SmartCity Traffic Simulator Server (server.js)
 * Lightweight native HTTP server with COOP/COEP headers to support SharedArrayBuffer.
 * Implements native WebSockets for hybrid C++ OpenMP backend piping.
 * Zero external dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`[HTTP Request] ${req.method} ${req.url}`);

  // Normalize request url path
  let filePath = req.url === '/' 
    ? path.join(__dirname, 'index.html') 
    : path.join(__dirname, req.url.split('?')[0]);

  // Security check: avoid directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Internal Server Error: ${err.code}`);
      }
    } else {
      // Inject security headers required for SharedArrayBuffer
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    }
  });
});

// WebSocket frame decoder
function decodeWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const byte0 = buffer[0];
  const byte1 = buffer[1];

  const fin = (byte0 & 0x80) !== 0;
  const opcode = byte0 & 0x0F;
  const isMasked = (byte1 & 0x80) !== 0;
  let payloadLen = byte1 & 0x7F;
  
  let offset = 2;
  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (isMasked) {
    if (buffer.length < offset + 4 + payloadLen) return null;
    const maskKey = buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = buffer[offset + i] ^ maskKey[i % 4];
    }
    return { opcode, payload: payload.toString('utf8'), bytesRead: offset + payloadLen };
  } else {
    if (buffer.length < offset + payloadLen) return null;
    const payload = buffer.subarray(offset, offset + payloadLen);
    return { opcode, payload: payload.toString('utf8'), bytesRead: offset + payloadLen };
  }
}

// WebSocket frame encoder
function sendWsTextFrame(socket, text) {
  const buf = Buffer.from(text, 'utf8');
  const len = buf.length;
  let header;
  
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  socket.write(Buffer.concat([header, buf]));
}

// Upgrade listener to handle WebSocket requests
server.on('upgrade', (req, socket, head) => {
  if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
    handleWebSocket(req, socket);
  }
});

function handleWebSocket(req, socket) {
  // 1. WebSocket Handshake
  const key = req.headers['sec-websocket-key'];
  const acceptKey = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
  );

  console.log('[WebSocket] Client connected.');

  // 2. Spawn C++ Backend Subprocess
  const exePath = path.join(__dirname, 'traffic_engine.exe');
  
  // Include MSYS2 ucrt64 path to resolve compiler runtime DLLs (like libgomp-1.dll)
  const env = { ...process.env };
  env.PATH = "C:\\msys64\\ucrt64\\bin;" + (env.PATH || "");

  const cppProcess = spawn(exePath, [], { env });

  cppProcess.on('error', (err) => {
    console.error('[C++ Backend] Spawn failed:', err);
    sendWsTextFrame(socket, JSON.stringify({ status: "error", message: "Failed to spawn C++ backend engine. Verify MSYS2 PATH." }));
  });

  cppProcess.stderr.on('data', (data) => {
    console.error(`[C++ Backend Stderr] ${data.toString()}`);
  });

  cppProcess.on('close', (code) => {
    console.log(`[C++ Backend] Process exited with code ${code}`);
    socket.destroy();
  });

  // 3. Accumulate C++ stdout data strictly line-by-line (splitting on '\n')
  let stdoutBuffer = '';
  cppProcess.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    let boundary = stdoutBuffer.indexOf('\n');
    while (boundary !== -1) {
      const line = stdoutBuffer.substring(0, boundary).trim();
      stdoutBuffer = stdoutBuffer.substring(boundary + 1);
      
      if (line) {
        // Forward complete lines to client
        sendWsTextFrame(socket, line);
      }
      boundary = stdoutBuffer.indexOf('\n');
    }
  });

  // 4. Handle incoming messages from WebSocket and pipe to C++ stdin
  let wsBuffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    wsBuffer = Buffer.concat([wsBuffer, chunk]);
    
    while (true) {
      const frame = decodeWsFrame(wsBuffer);
      if (!frame) break; // Incomplete frame, wait for more chunks
      
      wsBuffer = wsBuffer.subarray(frame.bytesRead);

      if (frame.opcode === 8) { // Connection Close
        console.log('[WebSocket] Client connection closed.');
        socket.end();
        break;
      }
      
      if (frame.opcode === 1) { // Text frame
        const msg = frame.payload.trim();
        if (msg) {
          cppProcess.stdin.write(msg + '\n');
        }
      }
    }
  });

  socket.on('close', () => {
    console.log('[WebSocket] Client disconnected.');
    cppProcess.kill();
  });

  socket.on('error', (err) => {
    console.error('[WebSocket] Socket error:', err);
    cppProcess.kill();
  });
}

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`🚀 SmartCity Traffic Simulator Server (Hybrid C++ Engine)`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🔒 WebSocket IPC pipe and COOP/COEP Headers are active.`);
  console.log(`=============================================================\n`);
});
