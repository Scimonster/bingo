import { describe, expect, it } from "vitest";
import {
  hasInfoContent,
  infoTextImages,
  inlineToRuns,
  parseInfoText,
  parseInline,
  printLayoutImages,
  printLayoutRenderImages,
  runsToInline,
  sanitizeInfoText,
  serializeInfoText,
  type MdBlock,
} from "../src";

const IMG = "users/u1/images/abc";

describe("info text format", () => {
  it("parses headings, alignment, images, underline and spans", () => {
    const b = parseInfoText(`# Title\n{center} ## Sub\n\n{end} Hello ++u++ [red big]{red large}\n\n{center} ![l](${IMG})\n![x](${IMG})`);
    expect(b).toEqual<MdBlock[]>([
      { t: "h", level: 1, c: [{ t: "text", v: "Title" }] },
      { t: "h", level: 2, c: [{ t: "text", v: "Sub" }], align: "center" },
      {
        t: "p",
        align: "end",
        c: [
          { t: "text", v: "Hello " },
          { t: "u", c: [{ t: "text", v: "u" }] },
          { t: "text", v: " " },
          { t: "span", color: "red", size: "large", c: [{ t: "text", v: "red big" }] },
        ],
      },
      { t: "img", path: IMG, size: "l", align: "center" },
      { t: "img", path: IMG, size: "m" },
    ]);
  });

  it("ignores unknown span attributes and invalid image paths", () => {
    expect(parseInline("[x]{evil}")).toEqual([{ t: "text", v: "x" }]);
    expect(parseInline("[x]{pink xl}")).toEqual([{ t: "span", size: "xl", c: [{ t: "text", v: "x" }] }]);
    expect(parseInfoText("![m](https://evil.test/x.png)")[0]!.t).toBe("p");
    expect(parseInfoText("![m](users/a/images/b/../c)")[0]!.t).toBe("p");
  });

  it("handles escapes", () => {
    expect(parseInline("\\*not\\* \\[x\\]{red}")).toEqual([{ t: "text", v: "*not* [x]{red}" }]);
    expect(parseInfoText("\\- not a list\n\n1\\. nor this").map((b) => b.t)).toEqual(["p", "p"]);
  });

  it("round-trips any run combination through serialize → parse", () => {
    const blocks: MdBlock[] = [
      { t: "h", level: 1, c: runsToInline([{ text: "Big ", b: true }, { text: "*title*", b: true, i: true }]), align: "center" },
      {
        t: "p",
        c: runsToInline([
          { text: "- starts like a list " },
          { text: "red", color: "red", b: true },
          { text: " and ", color: "red" },
          { text: "small", color: "red", size: "small", u: true },
          "br",
          { text: "1. second [line]{x} ++ok++ \\ _" },
        ]),
        align: "end",
      },
      { t: "ul", items: [runsToInline([{ text: "one", i: true }]), runsToInline([{ text: "two" }])] },
      { t: "ol", items: [runsToInline([{ text: "#first" }])] },
      { t: "img", path: IMG, size: "s" },
      { t: "p", c: runsToInline([{ text: "{center} ![m](" + IMG + ")" }]) },
    ];
    const md = serializeInfoText(blocks);
    const back = parseInfoText(md);
    const flat = (bs: MdBlock[]) =>
      bs.map((b) =>
        b.t === "p" || b.t === "h"
          ? { ...b, c: inlineToRuns(b.c) }
          : b.t === "ul" || b.t === "ol"
            ? { ...b, items: b.items.map((i) => inlineToRuns(i)) }
            : b,
      );
    expect(flat(back)).toEqual(flat(blocks));
    // Stable: serializing again gives the same string.
    expect(serializeInfoText(back)).toBe(md);
  });

  it("groups shared marks instead of repeating them", () => {
    const md = serializeInfoText([{ t: "p", c: runsToInline([{ text: "a", b: true }, { text: "b", b: true, i: true }, { text: "c", b: true }]) }]);
    expect(md).toBe("**a_b_c**");
  });

  it("keeps legacy content readable", () => {
    const b = parseInfoText("Hello **big** *world*\n- a");
    expect(b.map((x) => x.t)).toEqual(["p", "ul"]);
  });

  it("sanitizes html and links but keeps image lines and headings", () => {
    expect(sanitizeInfoText(`<b>x</b> [a](http://x)\n### Deep\n![m](${IMG})\n![m](http://x/y.png)`)).toBe(
      `x a\n## Deep\n![m](${IMG})\nm`,
    );
  });

  it("lists referenced images and info content", () => {
    const pl = { infoText: `![m](${IMG})\n\n![s](${IMG})\n\nhi`, infoImage: "users/u1/images/full", backgroundImage: "users/u1/images/bg" };
    expect(infoTextImages(pl.infoText)).toEqual([IMG]);
    expect(printLayoutImages(pl).sort()).toEqual([IMG, "users/u1/images/bg", "users/u1/images/full"].sort());
    expect(printLayoutRenderImages({ ...pl, infoMode: "image" }).sort()).toEqual(["users/u1/images/bg", "users/u1/images/full"]);
    expect(printLayoutRenderImages(pl).sort()).toEqual([IMG, "users/u1/images/bg"].sort());
    expect(hasInfoContent({ infoText: " \n ", infoMode: "text" })).toBe(false);
    expect(hasInfoContent({ infoText: "x", infoMode: "image" })).toBe(false);
    expect(hasInfoContent({ infoText: "", infoMode: "image", infoImage: IMG })).toBe(true);
  });
});
