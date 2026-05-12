import { describe, it, expect } from "vitest";
import {
  ARC_LENGTH_OPTS,
  ARC_LENGTH_SPECS,
  STRUCTURE_BEATS,
  CHAPTER_CONTENT_FIELDS,
  hasContent,
  isMeaningfulChapter,
  selectedOptionValue,
} from "./boardModel";

describe("boardModel constants", () => {
  it("every arc length option has a spec", () => {
    for (const opt of ARC_LENGTH_OPTS) {
      expect(ARC_LENGTH_SPECS[opt]).toBeTruthy();
      const { min, ideal, max } = ARC_LENGTH_SPECS[opt];
      expect(min).toBeLessThanOrEqual(ideal);
      expect(ideal).toBeLessThanOrEqual(max);
    }
  });

  it("known narrative structures have beat lists with unique keys", () => {
    for (const [name, beats] of Object.entries(STRUCTURE_BEATS)) {
      expect(beats.length, name).toBeGreaterThan(0);
      const keys = beats.map((b) => b.key);
      expect(new Set(keys).size, name).toBe(keys.length);
    }
  });

  it("CHAPTER_CONTENT_FIELDS includes the headline chapter fields", () => {
    expect(CHAPTER_CONTENT_FIELDS).toContain("chapter_title");
    expect(CHAPTER_CONTENT_FIELDS).toContain("main_conflict");
    expect(CHAPTER_CONTENT_FIELDS).toContain("ending_cliffhanger");
  });
});

describe("hasContent", () => {
  it("strings", () => {
    expect(hasContent("x")).toBe(true);
    expect(hasContent("")).toBe(false);
    expect(hasContent("   ")).toBe(false);
  });
  it("arrays / objects / nullish", () => {
    expect(hasContent(["", "x"])).toBe(true);
    expect(hasContent(["", "  ", []])).toBe(false);
    expect(hasContent({ a: "" })).toBe(false);
    expect(hasContent({ a: "v" })).toBe(true);
    expect(hasContent(null)).toBe(false);
    expect(hasContent(undefined)).toBe(false);
    expect(hasContent(0)).toBe(true); // a present non-null/false scalar counts
  });
});

describe("isMeaningfulChapter", () => {
  it("true when any content field is filled", () => {
    expect(isMeaningfulChapter({ chapter_title: "Ch 1" })).toBe(true);
    expect(isMeaningfulChapter({ main_conflict: "stuff" })).toBe(true);
  });
  it("false for an id-only / empty chapter", () => {
    expect(isMeaningfulChapter({ chapter_id: "ch_001", chapter_number: 1 })).toBe(false);
    expect(isMeaningfulChapter({})).toBe(false);
    expect(isMeaningfulChapter(null as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe("selectedOptionValue", () => {
  it("unwraps {selected} objects (up to 4 deep) to a string", () => {
    expect(selectedOptionValue("Wide Shot")).toBe("Wide Shot");
    expect(selectedOptionValue({ selected: "Medium Shot" })).toBe("Medium Shot");
    expect(selectedOptionValue({ selected: { selected: "Close-Up" } })).toBe("Close-Up");
    expect(selectedOptionValue({ selected: "" })).toBe("");
    expect(selectedOptionValue(null)).toBe("");
    expect(selectedOptionValue(undefined)).toBe("");
  });
});
