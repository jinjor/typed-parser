import { readFileSync, writeFileSync } from "fs";

const dts = readFileSync(__dirname + "/../dist/index.d.ts", "utf8").replace(
  /\/\*\*/g,
  "\n/**"
);
const escaped = dts
  .replace(/&/g, "&amp;")
  .replace(/\"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/'/g, "&#39;");

const html = `
<style>html, body, pre { margin:0; padding:0; } </style>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.15.9/styles/tomorrow-night.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.15.9/highlight.min.js"></script>
<script
 charset="UTF-8"
 src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.15.9/languages/typescript.min.js"></script>
<script>hljs.initHighlightingOnLoad();</script>
<pre><code class="typescript">${escaped}</code></pre>
`;

writeFileSync(__dirname + "/../docs/index.html", html);
