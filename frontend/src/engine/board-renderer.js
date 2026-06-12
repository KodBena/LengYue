/**
 * src/engine/board-renderer.ts
 * Pure SVG Go board rendering. Added: markerLabels.
 */
import { BOARD_PX, BOARD_COLOR, LINE_COLOR, MARKER_INNER_RATIO } from './constants';
import { boardGeometry, gridLines } from './board-geometry';
export function renderBoardToSvg(props) {
    const { size, stones, lastMove, showMarker, uid, markerLabels } = props;
    const safeUid = uid.replace(/[^a-z0-9]/gi, '');
    // Geometry from the shared SSOT (src/engine/board-geometry.ts) so the
    // string projection cannot drift from the component renderers.
    const { stoneR, toSVG } = boardGeometry(size);
    let stonesSvg = '';
    for (const key in stones) {
        const [sx, sy] = key.split(',').map(Number);
        const coords = toSVG(sx, sy);
        stonesSvg += `<circle cx="${coords.x}" cy="${coords.y}" r="${stoneR}" 
      fill="${stones[key] === 'B' ? `url(#gb-${safeUid})` : `url(#gw-${safeUid})`}" 
      stroke="${stones[key] === 'B' ? '#000' : '#aaa'}" stroke-width="0.5" />`;
    }
    let labelSvg = '';
    if (markerLabels) {
        for (const [key, label] of Object.entries(markerLabels)) {
            const [lx, ly] = key.split(',').map(Number);
            const coords = toSVG(lx, ly);
            labelSvg += `
        <rect x="${coords.x - 7}" y="${coords.y - 7}" width="14" height="14" fill="rgba(255,255,255,0)" rx="2" />
        <text x="${coords.x}" y="${coords.y + 1}" fill="#000" font-size="28" font-weight="bold" 
              font-family="monospace" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
        }
    }
    let markerSvg = '';
    if (showMarker && lastMove) {
        const coords = toSVG(lastMove.x, lastMove.y);
        markerSvg += `<circle cx="${coords.x}" cy="${coords.y}" r="${stoneR * MARKER_INNER_RATIO}" fill="none"
      stroke="${stones[`${lastMove.x},${lastMove.y}`] === 'B' ? 'white' : 'black'}" stroke-width="2" opacity="0.8" />`;
    }
    return `
    <svg viewBox="0 0 ${BOARD_PX} ${BOARD_PX}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="wd-${safeUid}" patternUnits="userSpaceOnUse" width="${BOARD_PX}" height="${BOARD_PX}"><image href="/textures/wood.jpg" width="${BOARD_PX}" height="${BOARD_PX}" preserveAspectRatio="xMidYMid slice" /></pattern>
        <radialGradient id="gb-${safeUid}" cx="35%" cy="30%" r="50%"><stop offset="0%" stop-color="#666" /><stop offset="100%" stop-color="#111" /></radialGradient>
        <radialGradient id="gw-${safeUid}" cx="35%" cy="30%" r="50%"><stop offset="0%" stop-color="#fff" /><stop offset="100%" stop-color="#d0d0d0" /></radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="${BOARD_COLOR}" /><rect width="100%" height="100%" fill="url(#wd-${safeUid})" />
      <g stroke="${LINE_COLOR}" stroke-width="0.8" opacity="0.3">
        ${gridLines(size).map(l => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" />`).join('')}
      </g>
      ${stonesSvg}${markerSvg}${labelSvg}
    </svg>`.trim();
}
