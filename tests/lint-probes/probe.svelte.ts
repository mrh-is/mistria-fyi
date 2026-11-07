// Lint-ownership probe: see tests/lint-ownership.test.ts. Each line violates one rule on purpose.
debugger;
Promise.resolve(1);

function selectSide(side: "left" | "right"): void {
  switch (side) {
    case "left":
      return;
  }
}

selectSide("right");
