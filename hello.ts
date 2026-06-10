import "dotenv/config";
import OpenAI from "openai";

const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

async function main() {
  const res = await qwen.chat.completions.create({
    model: "qwen3.6-flash",
    messages: [
      {
        role: "user",
        content:
          "Classify this freelance inquiry into one of: web_app, mobile_app, ecommerce, automation, other. Reply with only the label: 'hi I need an app like uber but for laundry, budget?'",
      },
    ],
  });
  console.log("Qwen says:", res.choices[0].message.content);
}

main().catch(console.error);