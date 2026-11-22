import { describe, expect, it } from "vitest";
import { INFO_COLORS } from "@bingo/core";
import { docToMarkup, markupToDoc, type PMNode } from "./infoDoc";

const IMG = "users/u1/images/abc";
const text = (t: string, ...marks: PMNode["marks"] & object) => ({ type: "text", text: t, ...(marks.length ? { marks } : {}) });

describe("info editor document ⇄ markup", () => {
  it("serializes the editor's marks, blocks and images", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [text("Rules")] },
        {
          type: "paragraph",
          attrs: { textAlign: null },
          content: [
            text("Win "),
            text("big", { type: "bold" }, { type: "textStyle", attrs: { color: INFO_COLORS.red, fontSize: "1.3em" } }),
            { type: "hardBreak" },
            text("prizes", { type: "underline" }, { type: "italic" }),
          ],
        },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("one")] }] }] },
        { type: "infoImage", attrs: { path: IMG, size: "l", textAlign: "end" } },
      ],
    };
    const md = docToMarkup(doc);
    expect(md).toBe(`{center} # Rules\n\nWin [**big**]{red large}\n_++prizes++_\n\n- one\n\n{end} ![l](${IMG})`);
    // And back: the editor document re-serializes to the same markup.
    expect(docToMarkup(markupToDoc(md))).toBe(md);
  });

  it("drops what the format can't express", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [text("pasted", { type: "textStyle", attrs: { color: "rgb(1, 2, 3)", fontSize: "31px" } }), text(" *stars*")] },
        { type: "paragraph", attrs: { textAlign: "justify" }, content: [] },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [text("a")] },
                { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("nested")] }] }] },
              ],
            },
          ],
        },
        { type: "infoImage", attrs: { path: "https://evil.test/x.png", size: "m" } },
      ],
    };
    expect(docToMarkup(doc)).toBe("pasted \\*stars\\*\n\n1. a\n2. nested");
  });

  it("loads legacy and empty text", () => {
    expect(markupToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(docToMarkup(markupToDoc("**Hi** *there*\n- a\n- b"))).toBe("**Hi** _there_\n\n- a\n- b");
  });
});
