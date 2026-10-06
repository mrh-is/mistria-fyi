import { describe, expect, it } from "vitest";

import { messageParts } from "./message-parts.js";

describe("messageParts", () => {
  it("splits a rendered message at its slots, in the locale's word order", () => {
    const english = messageParts((slot) => `By ${slot("a")}, for ${slot("b")}.`);
    const japanese = messageParts((slot) => `${slot("b")}向け、${slot("a")}製。`);

    expect(english).toEqual(["By ", { slot: "a" }, ", for ", { slot: "b" }, "."]);
    expect(japanese).toEqual([{ slot: "b" }, "向け、", { slot: "a" }, "製。"]);
  });

  it("returns plain text when the message has no slots", () => {
    expect(messageParts(() => "Hello.")).toEqual(["Hello."]);
  });

  it("throws when a message drops a slot it was given", () => {
    expect(() => messageParts((slot) => `Only ${slot("a")}.${slot("b") && ""}`)).toThrow(
      /dropped.*b/u,
    );
  });
});
