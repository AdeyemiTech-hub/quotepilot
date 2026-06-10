// Shared Qwen client (OpenAI-compatible API on DashScope).
// Every module that talks to a model imports `qwen` from here so there is
// exactly one configured client in the process.
import "dotenv/config";
import OpenAI from "openai";

export const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  // qwen3.7-max is a reasoning model: a single extraction can think for
  // ~25s with no bytes on the wire. That silent window is long enough for an
  // intermediary (or undici's default body timeout) to drop the socket, which
  // the SDK surfaces as a bare "Connection error". A short flash call like
  // hello.ts never stays idle long enough to hit it. Give slow calls room and
  // let the SDK auto-retry transient connection drops.
  timeout: 120_000, // 2 min ceiling per request
  maxRetries: 3,    // retry connection errors / 429s / 5xx
});

// Model name constants — keep these in one place so swapping versions is a
// single-line change.
export const MODEL_MAX = "qwen3.7-max";     // heavy reasoning / structured output
export const MODEL_FLASH = "qwen3.6-flash"; // cheap, fast classification / drafting
export const MODEL_EMBED = "text-embedding-v4";
