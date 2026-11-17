import QRCode from "qrcode";

/** QR code as standalone SVG markup (no quiet zone; sized by CSS). */
export async function qrSvg(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  // Let CSS size it; keep crisp module edges.
  return svg.replace("<svg ", '<svg shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" ');
}
