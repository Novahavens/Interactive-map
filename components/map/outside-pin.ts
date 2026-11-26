import type { OutsideHome } from "@/lib/types";
import { outsideChipText, outsidePinLabel, pinPrecision, sourceLetter } from "@/lib/outside-pins";

export interface OutsidePinState {
  selected?: boolean;
  hovered?: boolean;
  /** False = a rail filter (pets, photos, priced) excludes it: dimmed, like our own pins. */
  shown?: boolean;
}

/**
 * The pin for a home that is not in our database: ink outline and the source letter (Z / F) on an ink square
 * where our pins carry a status dot. No colour of its own. Plain DOM, styled entirely by globals.css, and built
 * with textContent only (the source and title come from listing sites).
 */
export function buildOutsidePin(
  home: Pick<OutsideHome, "title" | "rent" | "source" | "score" | "precision">,
  { selected = false, hovered = false, shown = true }: OutsidePinState = {},
): HTMLElement {
  const precision = pinPrecision(home);
  const wrap = document.createElement("div");
  const classes = ["nh-pin", "nh-pin--outside"];
  if (precision === "area") classes.push("nh-pin--approx"); // dashed: area-level, not on the house
  if (precision === "approx") classes.push("nh-pin--near");
  if (selected) classes.push("nh-pin--selected");
  if (hovered) classes.push("nh-pin--hover");
  if (!shown) classes.push("nh-pin--dimmed");
  wrap.className = classes.join(" ");
  wrap.setAttribute("role", "button");
  wrap.setAttribute("aria-label", outsidePinLabel(home));

  const chip = document.createElement("span");
  chip.className = "nh-pin__chip";

  const src = document.createElement("span");
  src.className = "nh-src";
  src.setAttribute("aria-hidden", "true");
  src.textContent = sourceLetter(home.source);
  chip.appendChild(src);

  if (precision !== "exact") {
    const approx = document.createElement("span");
    approx.className = "nh-pin__approx";
    approx.setAttribute("aria-hidden", "true");
    approx.textContent = "≈";
    chip.appendChild(approx);
  }

  const rent = document.createElement("span");
  rent.textContent = outsideChipText(home.rent);
  chip.appendChild(rent);

  const caret = document.createElement("span");
  caret.className = "nh-pin__caret";

  wrap.append(chip, caret);
  return wrap;
}
