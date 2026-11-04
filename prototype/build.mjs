// Builds index.html (standalone, hostable) from app.html (the shared page body).
import { readFileSync, writeFileSync } from 'node:fs';
const body = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
</head>
`;
writeFileSync(new URL('./index.html', import.meta.url), head + body + '\n</html>\n');
console.log('wrote index.html');
