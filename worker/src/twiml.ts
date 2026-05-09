// Twilio Media Streams TwiML. <Connect><Stream> gives us a bidirectional
// WebSocket so the Gemini agent can both hear and speak.
//
// We pass the caller's number two ways for reliability:
//   1. As a URL query param on the stream URL (Twilio preserves URLs verbatim).
//   2. As a <Parameter> child (surfaces in start.customParameters).
// CallSession reads (1) preferentially and falls back to (2).
export function incomingTwiml(streamUrl: string, fromPhone?: string): string {
  const url = fromPhone
    ? `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}from=${encodeURIComponent(fromPhone)}`
    : streamUrl;
  const param = fromPhone
    ? `\n      <Parameter name="from" value="${escapeXml(fromPhone)}" />`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(url)}">${param}
    </Stream>
  </Connect>
</Response>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
