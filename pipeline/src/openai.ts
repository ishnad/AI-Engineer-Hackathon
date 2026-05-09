// Minimal OpenAI HTTP client. We use the Responses API for the extraction
// agent (it natively supports tool-calling loops) and /images/generations
// for the poster.

export interface OpenAIClient {
  responsesCreate(body: unknown): Promise<any>;
  imagesGenerate(body: unknown): Promise<{ data: { url?: string; b64_json?: string }[] }>;
}

// Pulls the aggregate text out of a Responses API result. Tries the convenience
// `output_text` field first; falls back to walking `output[*].content[*].text`.
export function responseText(res: any): string {
  if (typeof res?.output_text === "string" && res.output_text.length > 0) {
    return res.output_text;
  }
  const out = (res?.output ?? []) as any[];
  return out
    .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
    .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
    .join("");
}

export function createOpenAI(apiKey: string, baseUrl?: string): OpenAIClient {
  const root = (baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
  const headers = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
  return {
    async responsesCreate(body) {
      const res = await fetch(`${root}/v1/responses`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`openai responses ${res.status}: ${await res.text()}`);
      return res.json();
    },
    async imagesGenerate(body) {
      const res = await fetch(`${root}/v1/images/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`openai images ${res.status}: ${await res.text()}`);
      return res.json();
    },
  };
}
