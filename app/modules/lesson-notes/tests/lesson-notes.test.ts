import { describe, it, expect } from "vitest";
import { noteDraftState } from "../index";

describe("noteDraftState", () => {
  it("cannot save an empty box when there is no note yet", () => {
    const state = noteDraftState("", null);
    expect(state.dirty).toBe(false);
    expect(state.canSave).toBe(false);
    expect(state.counter).toBe("0 / 2,000");
  });

  it("can save new text", () => {
    const state = noteDraftState("Generics are type parameters", null);
    expect(state.dirty).toBe(true);
    expect(state.canSave).toBe(true);
    expect(state.length).toBe(28);
  });

  it("is clean when the text matches the saved note", () => {
    const state = noteDraftState("Saved text", "Saved text");
    expect(state.dirty).toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("is dirty when the text differs from the saved note", () => {
    const state = noteDraftState("Saved text, edited", "Saved text");
    expect(state.dirty).toBe(true);
    expect(state.canSave).toBe(true);
  });

  it("cannot save whitespace only", () => {
    const state = noteDraftState("   \n ", "Saved text");
    expect(state.dirty).toBe(true);
    expect(state.canSave).toBe(false);
  });

  it("allows exactly the maximum length", () => {
    const state = noteDraftState("a".repeat(2000), null);
    expect(state.overLimit).toBe(false);
    expect(state.canSave).toBe(true);
    expect(state.maxLength).toBe(2000);
  });

  it("cannot save past the maximum length", () => {
    const state = noteDraftState("a".repeat(2001), null);
    expect(state.overLimit).toBe(true);
    expect(state.canSave).toBe(false);
    expect(state.counter).toBe("2,001 / 2,000");
  });

  it("is clean once the server has saved the trimmed text", () => {
    const state = noteDraftState("  Saved text \n", "Saved text");
    expect(state.dirty).toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("measures the limit after trimming, as the server does", () => {
    const state = noteDraftState(`${"a".repeat(2000)}   `, null);
    expect(state.overLimit).toBe(false);
    expect(state.canSave).toBe(true);
  });
});
