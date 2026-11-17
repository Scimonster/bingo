import { describe, expect, it } from "vitest";
import { toggleListLines, wrapSelection } from "./InfoTextEditor";

describe("wrapSelection", () => {
  it("wraps and unwraps bold", () => {
    const r = wrapSelection("hello world", 6, 11, "**");
    expect(r.value).toBe("hello **world**");
    expect(wrapSelection(r.value, r.selStart, r.selEnd, "**").value).toBe("hello world");
  });
  it("inserts placeholder text for an empty selection", () => expect(wrapSelection("a ", 2, 2, "*").value).toBe("a *text*"));
});

describe("toggleListLines", () => {
  it("bullets the touched lines and removes them again", () => {
    const r = toggleListLines("x\none\ntwo\ny", 3, 8, "ul");
    expect(r.value).toBe("x\n- one\n- two\ny");
    expect(toggleListLines(r.value, r.selStart, r.selEnd, "ul").value).toBe("x\none\ntwo\ny");
  });
  it("numbers lines, replacing bullets", () => expect(toggleListLines("- a\n- b", 0, 7, "ol").value).toBe("1. a\n2. b"));
});
