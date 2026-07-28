import { ImageResponse } from "next/og";

/**
 * Favicon — the ProFit mark rendered at browser-tab size.
 *
 * Generated rather than checked in as a binary so it stays in step with the
 * brand colour: this is the one place the green is hardcoded, because an OG
 * renderer has no stylesheet to read `--primary` from.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BRAND_GREEN = "#2ee87f";
// Same proportions as LogoMark in @repo/design-system: bars 5 wide, sitting on
// a common baseline 6 up from the bottom of a 32-unit tile.
const MARK_FOREGROUND = "#052e16";
const BAR_HEIGHTS = [7, 12, 19];

const Icon = () =>
  new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 1.5,
        paddingBottom: 6,
        background: BRAND_GREEN,
        borderRadius: 9,
      }}
    >
      {BAR_HEIGHTS.map((height) => (
        <div
          key={height}
          style={{
            width: 5,
            height,
            borderRadius: 2.5,
            background: MARK_FOREGROUND,
          }}
        />
      ))}
    </div>,
    { ...size }
  );

export default Icon;
