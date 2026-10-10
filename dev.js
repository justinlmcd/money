'use strict';
// Local preview: node dev.js → http://localhost:8798
const http = require('node:http');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const config = require('./api/config');
const port = Number(process.env.MONEY_PORT || 8798);
const pages = {'/':'index.html','/index.html':'index.html','/money.js':'money.js','/quote-of-day.js':'quote-of-day.js'};
http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/api/config') return config(request, response);
  if (request.method !== 'GET' || !Object.hasOwn(pages, pathname)) { response.writeHead(404, {'Content-Type':'text/plain'}); return response.end('Not found'); }
  try {
    const body = await readFile(path.join(__dirname, pages[pathname]));
    response.writeHead(200, {'Content-Type': (pathname.endsWith('.js') ? 'application/javascript' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store'});
    response.end(body);
  } catch { response.writeHead(500, {'Content-Type':'text/plain'}); response.end('Could not open MONEY.'); }
}).listen(port, '127.0.0.1', () => console.log(`MONEY preview: http://localhost:${port}`));
