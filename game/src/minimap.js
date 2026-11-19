// Rotating minimap for MARAVILLA BAY.
// A 2D canvas in the HUD corner. The world is drawn rotated so the player
// always faces up: roads as lines, the bay as a blue band, the player as a
// white arrow in the centre, police as red dots, the mission marker as a
// yellow diamond, garage / safehouse / shops as small icons. Pure 2D, no
// WebGL, redrawn every frame from state.

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  const size = canvas.width; // square
  const half = size / 2;
  const scale = size / 260; // show ~260 world units across

  const AVENUES = [];
  for (let v = -500; v <= 500; v += 100) AVENUES.push(v);

  return {
    draw(state) {
      const px = state.player.x, pz = state.player.z;
      const heading = state.playerHeading;
      g.clearRect(0, 0, size, size);
      // round mask
      g.save();
      g.beginPath();
      g.arc(half, half, half - 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#20242c';
      g.fillRect(0, 0, size, size);
      // rotate so the player faces up
      g.translate(half, half);
      g.rotate(-heading);
      g.translate(-px * scale, -pz * scale);
      // bay water (south)
      g.fillStyle = '#2e6f8e';
      g.fillRect(-700 * scale, 520 * scale, 1400 * scale, 320 * scale);
      // blocks
      g.fillStyle = '#3a3d42';
      for (let bx = -500; bx <= 500; bx += 100) {
        for (let bz = -500; bz <= 400; bz += 100) {
          g.fillRect((bx + 12) * scale, (bz + 12) * scale, 76 * scale, 76 * scale);
        }
      }
      // roads
      g.strokeStyle = '#5a5e66';
      g.lineWidth = 13 * scale;
      for (const a of AVENUES) {
        g.beginPath(); g.moveTo(-600 * scale, a * scale); g.lineTo(600 * scale, a * scale); g.stroke();
        g.beginPath(); g.moveTo(a * scale, -600 * scale); g.lineTo(a * scale, 520 * scale); g.stroke();
      }
      // causeway bridge
      g.strokeStyle = '#8a8a80';
      g.lineWidth = 20 * scale;
      g.beginPath(); g.moveTo(450 * scale, 520 * scale); g.lineTo(450 * scale, 685 * scale); g.stroke();
      // places
      const dot = (x, z, color, r) => {
        g.fillStyle = color;
        g.beginPath(); g.arc(x * scale, z * scale, r, 0, Math.PI * 2); g.fill();
      };
      dot(-350, -350, '#ffd23e', 5); // garage
      dot(-250, -450, '#3eff7a', 5); // safehouse
      dot(150, -450, '#9fc4ff', 5); // station
      dot(-420, 180, '#ff9a8a', 5); // chop shop
      // police blips
      for (const c of state.policeCars) dot(c.x, c.z, '#ff4040', 4);
      if (state.heliActive) dot(state.heliX, state.heliZ, '#ff4040', 6);
      // traffic (small grey dots)
      g.fillStyle = '#aab0b8';
      for (const t of state.traffic) {
        g.beginPath(); g.arc(t.x * scale, t.z * scale, 2.5, 0, Math.PI * 2); g.fill();
      }
      // mission marker: yellow diamond
      if (state.marker) {
        const mx = state.marker.x * scale, mz = state.marker.z * scale;
        g.fillStyle = '#ffd23e';
        g.beginPath();
        g.moveTo(mx, mz - 8); g.lineTo(mx + 7, mz); g.lineTo(mx, mz + 8); g.lineTo(mx - 7, mz);
        g.closePath(); g.fill();
      }
      g.restore();
      // rim + player arrow (unrotated, always up)
      g.strokeStyle = '#e8e4d2';
      g.lineWidth = 3;
      g.beginPath(); g.arc(half, half, half - 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(half, half - 9); g.lineTo(half + 6, half + 7); g.lineTo(half, half + 3); g.lineTo(half - 6, half + 7);
      g.closePath(); g.fill();
      // north tick
      g.fillStyle = '#e8e4d2';
      g.font = 'bold 11px sans-serif';
      g.textAlign = 'center';
      g.fillText('N', half, 13);
    },
  };
}
