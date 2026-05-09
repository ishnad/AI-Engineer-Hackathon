// Twilio Media Streams TwiML. <Connect><Stream> gives us a bidirectional
// WebSocket so the Gemini agent can both hear and speak.
export function incomingTwiml(streamUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
}
