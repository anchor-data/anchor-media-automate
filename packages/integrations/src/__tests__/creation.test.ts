import { describe, expect, it } from "vitest";
import type { Guideline, Idea, Job } from "@ama/shared";
import { slideFieldsSchema } from "@ama/shared";
import { MockCreationAgent, expectedPostType, validateDeck } from "../creation";

const idea: Idea = {
  id: "idea_1",
  accountId: "acc_1",
  title: "転職で後悔しない3つの準備",
  summary: "在職中にできる準備をまとめる",
  pillar: "転職準備",
  topicKey: "prep.three",
  hook: "辞める前に確認",
  angle: "在職中の準備",
  referenceIds: [],
  jobId: null,
  status: "selected",
  rationale: "",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01"
};

const guideline: Guideline = {
  id: "g1",
  accountId: "acc_1",
  target: "t",
  concept: "c",
  tone: "tone",
  contentPillars: [],
  ngRules: ["内定を保証"],
  ctaPolicy: "",
  hashtagPolicy: "",
  jobPickEnabled: false,
  systemPrompt: "",
  version: 1,
  active: true,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01"
};

const job: Job = { id: "job_1", company: "ACME", role: "PM", location: "東京", url: "https://example.com/j" };

const tools = (overrides: { idea?: Idea; guideline?: Guideline } = {}) => ({
  getIdea: async () => overrides.idea ?? idea,
  getGuideline: async () => overrides.guideline ?? guideline,
  listReferences: async () => [],
  getJob: async () => job
});

function validSlides() {
  return Object.fromEntries(Object.keys(slideFieldsSchema.shape).map((name) => [name, "あ"]));
}

describe("expectedPostType", () => {
  it("is job_pick only when the idea has a job and the guideline enables it", () => {
    expect(expectedPostType({ jobId: "j" }, { jobPickEnabled: true })).toBe("job_pick");
    expect(expectedPostType({ jobId: "j" }, { jobPickEnabled: false })).toBe("knowhow");
    expect(expectedPostType({ jobId: null }, { jobPickEnabled: true })).toBe("knowhow");
  });
});

describe("validateDeck", () => {
  const base = { postType: "knowhow", slides: validSlides(), caption: "c", hashtags: ["#a"] };

  it("accepts a deck within limits", () => {
    expect(validateDeck(base, { idea, guideline }).ok).toBe(true);
  });

  it("reports the field that exceeds its character limit", () => {
    const result = validateDeck(
      { ...base, slides: { ...validSlides(), s1_title: "あ".repeat(23) } },
      { idea, guideline }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toContain("slides.s1_title");
  });

  it("rejects a deck with a missing slide field", () => {
    const { s8_cta: _omit, ...rest } = validSlides();
    expect(validateDeck({ ...base, slides: rest }, { idea, guideline }).ok).toBe(false);
  });

  it("rejects job_pick when the guideline does not allow it", () => {
    const result = validateDeck({ ...base, postType: "job_pick" }, { idea, guideline });
    expect(result.ok).toBe(false);
  });

  it("requires job_pick when the idea has a job and the guideline allows it", () => {
    const result = validateDeck(base, {
      idea: { ...idea, jobId: "job_1" },
      guideline: { ...guideline, jobPickEnabled: true }
    });
    expect(result.ok).toBe(false);
  });

  it("flags NG phrases anywhere in the deck", () => {
    const result = validateDeck({ ...base, caption: "内定を保証します" }, { idea, guideline });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toContain("内定を保証");
  });
});

describe("MockCreationAgent", () => {
  it("builds a valid knowhow deck within limits", async () => {
    const output = await new MockCreationAgent().run({ ideaId: idea.id, accountId: idea.accountId }, tools());
    expect(output.deck.postType).toBe("knowhow");
    expect(output.deck.slides.s7_label).toBe("まとめ");
    expect(slideFieldsSchema.safeParse(output.deck.slides).success).toBe(true);
  });

  it("fills slide 7 from the job when job_pick applies", async () => {
    const output = await new MockCreationAgent().run(
      { ideaId: idea.id, accountId: idea.accountId },
      tools({ idea: { ...idea, jobId: job.id }, guideline: { ...guideline, jobPickEnabled: true } })
    );
    expect(output.deck.postType).toBe("job_pick");
    expect(output.deck.slides.s7_head).toContain("ACME");
  });

  it("fails when the idea does not exist", async () => {
    await expect(
      new MockCreationAgent().run({ ideaId: "nope", accountId: "acc_1" }, { ...tools(), getIdea: async () => null })
    ).rejects.toThrow(/Idea not found/);
  });
});
