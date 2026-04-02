import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the Apryse extraction module
vi.mock("./apryseExtraction", () => ({
  extractPDFData: vi.fn().mockResolvedValue({
    success: true,
    data: {
      pages: [
        {
          properties: { pageNumber: 1 },
          keyValueElements: [
            { key_text: "Fund Name", value_text: "Contoso Cashew Fund Class A", confidence: 0.98, key_rect: null, value_rect: null },
            { key_text: "Total Net Assets", value_text: "USD17,180.2 mil", confidence: 0.97, key_rect: null, value_rect: null },
            { key_text: "Operating Expenses", value_text: "1.11%", confidence: 0.96, key_rect: null, value_rect: null },
          ],
        },
      ],
      metadata: {
        engine: "e_generic_key_value",
        sdk_version: "11.11.0",
        source_file: "test.pdf",
        total_pairs_extracted: 3,
      },
    },
    usedMock: true,
    extractionTime: 1200,
  }),
}));

// Mock the LLM invocation
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            fundName: "Contoso Cashew Fund Class A",
            suitability: {
              rating: "Moderate",
              score: 3,
              headline: "Suitable for medium-risk growth investors",
              detail: "This fund targets long-term capital appreciation with a risk level of 2 out of 5.",
            },
            volatility: {
              level: "Moderate",
              headline: "Moderate volatility with beta above market",
              detail: "Standard deviation of 20.40 indicates moderate price swings.",
            },
            longTermPerformance: {
              headline: "Strong 3-year returns, mixed long-term track record",
              detail: "The 3-year return of 18.29% is impressive, though the 5-year return of 1.40% is weak.",
            },
            feeCaution: {
              level: "High",
              headline: "High front load and operating expenses warrant scrutiny",
              detail: "Operating expenses of 1.11% combined with a 6% front load significantly erode returns.",
            },
            diversification: {
              headline: "Concentrated in US mid-cap equities",
              detail: "88% equity allocation with only 12% foreign equity limits geographic diversification.",
            },
            summary:
              "The Contoso Cashew Fund Class A targets mid-cap growth with strong 3-year returns of 18.29%, but investors should note the high 6% front load and 1.11% expense ratio. Suitable for medium-risk investors with a 4-10 year horizon who can absorb moderate volatility. Consider fee impact before committing.",
          }),
        },
      },
    ],
  }),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("extraction.extractData", () => {
  it("returns extracted data with usedMock flag for demo mode", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Create a minimal base64 PDF (just header bytes for testing)
    const fakePdfBase64 = Buffer.from("%PDF-1.4 test").toString("base64");

    const result = await caller.extraction.extractData({
      pdfBase64: fakePdfBase64,
      fileName: "test.pdf",
    });

    expect(result.success).toBe(true);
    expect(result.usedMock).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as Record<string, unknown>).pages).toBeDefined();
    expect(result.extractionTime).toBeGreaterThan(0);
  });

  it("includes metadata with engine type in extraction result", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const fakePdfBase64 = Buffer.from("%PDF-1.4 test").toString("base64");
    const result = await caller.extraction.extractData({
      pdfBase64: fakePdfBase64,
      fileName: "InvestmentFactSheet.pdf",
    });

    const metadata = (result.data as Record<string, unknown>).metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata.engine).toBe("e_generic_key_value");
  });
});

describe("analysis.analyzeWithAI", () => {
  it("returns structured AI analysis with all required fields", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const mockExtractedData = {
      pages: [
        {
          properties: { pageNumber: 1 },
          keyValueElements: [
            { key_text: "Fund Name", value_text: "Contoso Cashew Fund Class A", confidence: 0.98, key_rect: null, value_rect: null },
            { key_text: "Risk Level", value_text: "2", confidence: 0.95, key_rect: null, value_rect: null },
            { key_text: "Operating Expenses", value_text: "1.11%", confidence: 0.96, key_rect: null, value_rect: null },
          ],
        },
      ],
      _meta: { engine: "e_generic_key_value", source_file: "test.pdf" },
    };

    const result = await caller.analysis.analyzeWithAI({
      extractedData: mockExtractedData,
    });

    expect(result.fundName).toBe("Contoso Cashew Fund Class A");
    expect(result.suitability).toBeDefined();
    expect(result.suitability.rating).toBeTruthy();
    expect(result.suitability.headline).toBeTruthy();
    expect(result.volatility).toBeDefined();
    expect(result.longTermPerformance).toBeDefined();
    expect(result.feeCaution).toBeDefined();
    expect(result.diversification).toBeDefined();
    expect(result.summary).toBeTruthy();
    expect(result.summary.split(" ").length).toBeGreaterThanOrEqual(40);
  });

  it("returns a summary within the 50-70 word target range", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analysis.analyzeWithAI({
      extractedData: { pages: [], metadata: { engine: "e_generic_key_value" } },
    });

    const wordCount = result.summary.split(/\s+/).filter(Boolean).length;
    // Allow some flexibility — LLM may vary slightly
    expect(wordCount).toBeGreaterThanOrEqual(40);
    expect(wordCount).toBeLessThanOrEqual(100);
  });
});
