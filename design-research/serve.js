const http = require("http");
const fs = require("fs");
const path = require("path");
const root = process.argv[2] || process.cwd();
const types = { ".html": "text/html", ".png": "image/png", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(root, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(8757, () => console.log("serving", root, "on 8757"));
