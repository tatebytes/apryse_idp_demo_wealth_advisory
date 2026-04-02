import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { extractPDFData } from "./apryseExtraction";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Step 2: Extract key-value pairs from uploaded PDF ───────────────────
  extraction: router({
    extractData: publicProcedure
      .input(
        z.object({
          // Base64-encoded PDF content
          pdfBase64: z.string(),
          fileName: z.string().default("InvestmentFactSheet.pdf"),
        })
      )
      .mutation(async ({ input }) => {
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
        const result = await extractPDFData(pdfBuffer, input.fileName);
        return result;
      }),
  }),

  // ─── Step 3: Analyze extracted JSON with LLM ─────────────────────────────
  analysis: router({
    analyzeWithAI: publicProcedure
      .input(
        z.object({
          extractedData: z.record(z.string(), z.unknown()),
        })
      )
      .mutation(async ({ input }) => {
        const systemPrompt = `You are a senior investment advisor at a Singapore private bank. 
You analyze investment fact sheets and provide clear, professional advisory insights for wealth managers and their clients.
Always respond with valid JSON matching the exact schema requested. Be specific, data-driven, and use the actual numbers from the extracted data.`;

        // Build a clean summary of the real extraction data for the LLM
        // The extractedData follows the Apryse generic key-value JSON schema
        const pages = (input.extractedData.pages as Array<{
          properties: { pageNumber: number };
          keyValueElements: Array<{
            confidence: number;
            key_text: string;
            value_text: string;
          }>;
        }>) || [];

        const flatPairs = pages.flatMap(p =>
          (p.keyValueElements || [])
            .filter(e => e.key_text && e.value_text)
            .map(e => `${e.key_text}: ${e.value_text} (conf: ${Math.round(e.confidence * 100)}%)`)
        );

        const extractionSummary = flatPairs.join("\n");

        const userPrompt = `Analyze this investment fact sheet data extracted by Apryse SDK and provide structured advisory insights.

Extracted key-value pairs from the Contoso Cashew Fund fact sheet:
${extractionSummary}

Return a JSON object with EXACTLY these fields:
{
  "fundName": "Name of the fund",
  "suitability": {
    "rating": "Conservative | Moderate | Aggressive",
    "score": 1-5,
    "headline": "One-line suitability verdict",
    "detail": "2-3 sentences on who this fund suits, referencing the risk level, objective, and investor profile"
  },
  "volatility": {
    "level": "Low | Moderate | High | Very High",
    "headline": "One-line volatility summary",
    "detail": "2-3 sentences explaining the standard deviation, beta, and what this means for a Singapore HNW investor"
  },
  "longTermPerformance": {
    "headline": "One-line performance verdict",
    "detail": "2-3 sentences interpreting the 10-year return, since-inception return, and benchmark comparison"
  },
  "feeCaution": {
    "level": "Low | Moderate | High",
    "headline": "One-line fee assessment",
    "detail": "2-3 sentences on operating expenses, front load, and total cost impact over a 10-year horizon"
  },
  "diversification": {
    "headline": "One-line diversification assessment",
    "detail": "2-3 sentences on asset allocation, geographic exposure, and concentration risk"
  },
  "summary": "A 50-70 word executive summary that a relationship manager could read aloud to a client in 30 seconds. Include the fund name, key strength, main risk, and a clear recommendation stance."
}`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "investment_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  fundName: { type: "string" },
                  suitability: {
                    type: "object",
                    properties: {
                      rating: { type: "string" },
                      score: { type: "number" },
                      headline: { type: "string" },
                      detail: { type: "string" },
                    },
                    required: ["rating", "score", "headline", "detail"],
                    additionalProperties: false,
                  },
                  volatility: {
                    type: "object",
                    properties: {
                      level: { type: "string" },
                      headline: { type: "string" },
                      detail: { type: "string" },
                    },
                    required: ["level", "headline", "detail"],
                    additionalProperties: false,
                  },
                  longTermPerformance: {
                    type: "object",
                    properties: {
                      headline: { type: "string" },
                      detail: { type: "string" },
                    },
                    required: ["headline", "detail"],
                    additionalProperties: false,
                  },
                  feeCaution: {
                    type: "object",
                    properties: {
                      level: { type: "string" },
                      headline: { type: "string" },
                      detail: { type: "string" },
                    },
                    required: ["level", "headline", "detail"],
                    additionalProperties: false,
                  },
                  diversification: {
                    type: "object",
                    properties: {
                      headline: { type: "string" },
                      detail: { type: "string" },
                    },
                    required: ["headline", "detail"],
                    additionalProperties: false,
                  },
                  summary: { type: "string" },
                },
                required: [
                  "fundName",
                  "suitability",
                  "volatility",
                  "longTermPerformance",
                  "feeCaution",
                  "diversification",
                  "summary",
                ],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("No response from AI analysis");
        }

        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        return parsed as {
          fundName: string;
          suitability: { rating: string; score: number; headline: string; detail: string };
          volatility: { level: string; headline: string; detail: string };
          longTermPerformance: { headline: string; detail: string };
          feeCaution: { level: string; headline: string; detail: string };
          diversification: { headline: string; detail: string };
          summary: string;
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
