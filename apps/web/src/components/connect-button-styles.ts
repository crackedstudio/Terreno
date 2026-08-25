/**
 * Shared between the static `ConnectButton` shell and the lazily-loaded
 * `ConnectButtonInteractive`. They render the same button at the same size,
 * and the placeholder is the loading fallback for the real one, so any drift
 * between the two shows up as layout shift on the slowest connections.
 *
 * Its own module because the two components deliberately live in separate
 * chunks — see `privy-ready-context.ts`.
 */
export const buttonClassName = "pixel-btn pixel-btn-sm pixel-btn-filled";

export const buttonStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.14em",
  minWidth: 104,
  height: 32,
  padding: "0 10px",
  justifyContent: "center",
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
