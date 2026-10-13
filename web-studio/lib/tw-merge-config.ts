import { extendTailwindMerge } from "tailwind-merge";
import * as Tokens from "./ds/index.ts";

const colorKeys = Object.keys({ ...Tokens.Colors, ...Tokens.BorderColors });

export const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: colorKeys,
      spacing: Object.keys(Tokens.Sizes),
      radius: Object.keys(Tokens.BorderRadius),
      shadow: Object.keys(Tokens.Shadows),
    },
    classGroups: {
      "font-size": [{ text: [...Tokens.TextRoles] }],
      duration: [{ duration: [...Tokens.Durations] }],
    },
  },
});
