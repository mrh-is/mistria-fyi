import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_COMPRESSED_SIZE } from "$lib/engine/parse-sav.js";
import { userState } from "$lib/stores/user-state.svelte.js";

import ImportCard from "./import-card.svelte";

afterEach(() => {
  userState.resetAll();
});

describe("save import atomicity", () => {
  it("rejects an oversized save before reading it and preserves tracker state", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();
    const file = new File([], "oversized.sav");
    Object.defineProperty(file, "size", { value: MAX_COMPRESSED_SIZE + 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    render(ImportCard, { open: true });
    await fireEvent.change(screen.getByLabelText("Choose save files to import"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText(/Save file is too large/)).toBeInTheDocument();
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(userState.exportState()).toBe(before);
  });
});
