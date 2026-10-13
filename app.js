const canvas = document.getElementById("pizzaCanvas");
const ctx = canvas.getContext("2d");
const resetBtn = document.getElementById("resetBtn");
const finishBtn = document.getElementById("finishBtn");
const guideBtn = document.getElementById("guideBtn");
const coverageLabel = document.getElementById("coverageLabel");
const rimLabel = document.getElementById("rimLabel");
const spreadLabel = document.getElementById("spreadLabel");
const feedbackText = document.getElementById("feedbackText");

const gridSize = 128;
let sauceGrid = new Uint8Array(gridSize * gridSize);
let outsideGrid = new Uint8Array(gridSize * gridSize);
let drawing = false;
let guideOn = true;
let lastPoint = null;
let stats = null;

const geometry = {
  cx: 360,
  cy: 360,
  outerRadius: 275,
  targetRadius: 218,
  softRadius: 236,
  dollopRadius: 50,
  brushRadius: 34
};

function resetSauce() {
  sauceGrid = new Uint8Array(gridSize * gridSize);
  outsideGrid = new Uint8Array(gridSize * gridSize);
  drawing = false;
  lastPoint = null;
  addBrush(geometry.cx, geometry.cy, geometry.dollopRadius, 1);
  stats = measureSauce();
  updateLabels(false);
  feedbackText.textContent = "Drop into the center, then spiral outward. The goal is an even layer with a clean rim.";
  draw();
}

function gridIndex(x, y) {
  return y * gridSize + x;
}

function worldToGrid(value) {
  return Math.max(0, Math.min(gridSize - 1, Math.floor((value / canvas.width) * gridSize)));
}

function gridToWorld(value) {
  return ((value + 0.5) / gridSize) * canvas.width;
}

function addBrush(x, y, radius, amount = 1) {
  const gx = worldToGrid(x);
  const gy = worldToGrid(y);
  const gr = Math.max(1, Math.ceil((radius / canvas.width) * gridSize));
  const minX = Math.max(0, gx - gr);
  const maxX = Math.min(gridSize - 1, gx + gr);
  const minY = Math.max(0, gy - gr);
  const maxY = Math.min(gridSize - 1, gy + gr);

  for (let yy = minY; yy <= maxY; yy += 1) {
    for (let xx = minX; xx <= maxX; xx += 1) {
      const wx = gridToWorld(xx);
      const wy = gridToWorld(yy);
      const dx = wx - x;
      const dy = wy - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const centerDx = wx - geometry.cx;
        const centerDy = wy - geometry.cy;
        const centerDist = Math.sqrt(centerDx * centerDx + centerDy * centerDy);
        const idx = gridIndex(xx, yy);
        const softness = dist / radius;
        const add = softness < 0.62 ? amount + 1 : amount;

        if (centerDist <= geometry.softRadius) {
          sauceGrid[idx] = Math.min(8, sauceGrid[idx] + add);
        } else if (centerDist <= geometry.outerRadius) {
          outsideGrid[idx] = Math.min(8, outsideGrid[idx] + 1);
        }
      }
    }
  }
}

function spreadBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(distance / 10));

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    addBrush(x, y, geometry.brushRadius, 1);
  }
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function measureSauce() {
  let targetCells = 0;
  let covered = 0;
  let gaps = 0;
  let overlap = 0;
  let outside = 0;
  let edgeCovered = 0;
  let edgeCells = 0;

  for (let yy = 0; yy < gridSize; yy += 1) {
    for (let xx = 0; xx < gridSize; xx += 1) {
      const wx = gridToWorld(xx);
      const wy = gridToWorld(yy);
      const dx = wx - geometry.cx;
      const dy = wy - geometry.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = gridIndex(xx, yy);
      const value = sauceGrid[idx];

      if (dist <= geometry.targetRadius) {
        targetCells += 1;
        if (value > 0) covered += 1;
        if (value === 0) gaps += 1;
        if (value > 4) overlap += 1;
      }

      if (dist > geometry.targetRadius && dist <= geometry.softRadius) {
        edgeCells += 1;
        if (value > 0) edgeCovered += 1;
      }

      if (outsideGrid[idx] > 0) {
        outside += 1;
      }
    }
  }

  const coverage = covered / targetCells;
  const gapRate = gaps / targetCells;
  const overlapRate = overlap / targetCells;
  const rimMess = outside / Math.max(1, edgeCells);
  const edgeBlend = edgeCovered / Math.max(1, edgeCells);

  return {
    coverage,
    gapRate,
    overlapRate,
    rimMess,
    edgeBlend
  };
}

function qualityLabels(final = false) {
  const coverage = stats.coverage;
  const overlap = stats.overlapRate;
  const rim = stats.rimMess;
  const gaps = stats.gapRate;

  let coverageText = "Needs more";
  if (coverage > 0.88) coverageText = "Great";
  else if (coverage > 0.68) coverageText = "Good";
  else if (coverage > 0.42) coverageText = "Getting there";

  let rimText = "Clean";
  if (rim > 0.07) rimText = "Messy";
  else if (rim > 0.025) rimText = "Soft edge";

  let spreadText = "Patchy";
  if (coverage > 0.82 && gaps < 0.18 && overlap < 0.2) spreadText = "Silky";
  else if (coverage > 0.62 && overlap < 0.32) spreadText = "Even";
  else if (coverage > 0.35) spreadText = "Patchy";

  let feedback = "Keep spiraling outward from the center.";
  if (final) {
    if (coverage > 0.88 && rim < 0.04 && overlap < 0.24) {
      feedback = "That one feels excellent: even coverage, clean rim, and a confident spiral.";
    } else if (coverage > 0.7 && rim < 0.08) {
      feedback = "Good spread. A little more coverage or a lighter pass would clean it up.";
    } else if (rim >= 0.08) {
      feedback = "The sauce wandered into the rim. Try a smaller spiral near the edge.";
    } else if (coverage <= 0.7) {
      feedback = "There are still open patches. Try wider circles as you move outward.";
    } else {
      feedback = "Nice start. The gesture is readable; now chase a smoother layer.";
    }
  } else if (coverage > 0.7) {
    feedback = "Nice. The surface is filling in. Slow near the rim and keep the border clean.";
  } else if (rim > 0.06) {
    feedback = "Easy on the edge. The rim should stay mostly bare.";
  }

  return { coverageText, rimText, spreadText, feedback };
}

function updateLabels(final = false) {
  stats = measureSauce();
  const labels = qualityLabels(final);
  coverageLabel.textContent = labels.coverageText;
  rimLabel.textContent = labels.rimText;
  spreadLabel.textContent = labels.spreadText;
  feedbackText.textContent = labels.feedback;
}

function drawDough() {
  ctx.save();
  ctx.translate(geometry.cx, geometry.cy);

  ctx.fillStyle = "#b46f40";
  roundedBlob(0, 0, geometry.outerRadius + 18, "#b46f40", 1);
  roundedBlob(0, 0, geometry.outerRadius, "#efd3a4", 0.9);

  const crustGradient = ctx.createRadialGradient(0, 0, geometry.targetRadius, 0, 0, geometry.outerRadius);
  crustGradient.addColorStop(0, "#efd5a7");
  crustGradient.addColorStop(0.68, "#e3bd7f");
  crustGradient.addColorStop(1, "#c8864b");
  ctx.fillStyle = crustGradient;
  ctx.beginPath();
  ctx.arc(0, 0, geometry.outerRadius, 0, Math.PI * 2);
  ctx.arc(0, 0, geometry.targetRadius + 10, 0, Math.PI * 2, true);
  ctx.fill();

  ctx.strokeStyle = "rgba(107, 38, 54, 0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, geometry.outerRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function roundedBlob(x, y, radius, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 40; i += 1) {
    const angle = (i / 40) * Math.PI * 2;
    const wobble = 1 + Math.sin(angle * 3.1) * 0.018 + Math.cos(angle * 5.2) * 0.012;
    const px = x + Math.cos(angle) * radius * wobble;
    const py = y + Math.sin(angle) * radius * wobble;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSauce() {
  const cellSize = canvas.width / gridSize;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  for (let yy = 0; yy < gridSize; yy += 1) {
    for (let xx = 0; xx < gridSize; xx += 1) {
      const idx = gridIndex(xx, yy);
      const value = sauceGrid[idx] + outsideGrid[idx];
      if (!value) continue;

      const wx = xx * cellSize;
      const wy = yy * cellSize;
      const alpha = Math.min(0.95, 0.42 + value * 0.085);
      const red = value > 4 ? 160 : 210;
      const green = value > 4 ? 31 : 55;
      const blue = value > 4 ? 28 : 43;
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      ctx.fillRect(wx - 1, wy - 1, cellSize + 2, cellSize + 2);
    }
  }

  ctx.restore();
}

function drawGuide() {
  if (!guideOn) return;
  ctx.save();
  ctx.translate(geometry.cx, geometry.cy);

  ctx.setLineDash([9, 12]);
  ctx.strokeStyle = "rgba(107, 38, 54, 0.36)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, geometry.targetRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255, 244, 228, 0.72)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5.25; a += 0.08) {
    const r = 18 + a * 12.1;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.restore();
}

function drawTexture() {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#5c2528";
  for (let i = 0; i < 55; i += 1) {
    const angle = i * 2.399963;
    const radius = 40 + ((i * 43) % 245);
    const x = geometry.cx + Math.cos(angle) * radius;
    const y = geometry.cy + Math.sin(angle) * radius;
    if (Math.hypot(x - geometry.cx, y - geometry.cy) < geometry.outerRadius) {
      ctx.beginPath();
      ctx.ellipse(x, y, 1.6 + (i % 3), 0.8 + (i % 2), angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCursor(point) {
  if (!point) return;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-0.7);
  ctx.fillStyle = "rgba(255, 244, 228, 0.82)";
  ctx.strokeStyle = "#6b2636";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(0, -82);
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#a36740";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawDough();
  drawSauce();
  drawTexture();
  drawGuide();
  drawCursor(lastPoint);
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  drawing = true;
  lastPoint = getCanvasPoint(event);
  addBrush(lastPoint.x, lastPoint.y, geometry.brushRadius, 1);
  updateLabels(false);
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  const point = getCanvasPoint(event);
  if (drawing && lastPoint) {
    spreadBetween(lastPoint, point);
    lastPoint = point;
    updateLabels(false);
  } else {
    lastPoint = point;
  }
  draw();
});

canvas.addEventListener("pointerup", (event) => {
  drawing = false;
  lastPoint = getCanvasPoint(event);
  updateLabels(false);
  draw();
});

canvas.addEventListener("pointercancel", () => {
  drawing = false;
  lastPoint = null;
  draw();
});

canvas.addEventListener("pointerleave", () => {
  if (!drawing) {
    lastPoint = null;
    draw();
  }
});

resetBtn.addEventListener("click", resetSauce);

finishBtn.addEventListener("click", () => {
  updateLabels(true);
  draw();
});

guideBtn.addEventListener("click", () => {
  guideOn = !guideOn;
  guideBtn.textContent = guideOn ? "Guide On" : "Guide Off";
  guideBtn.setAttribute("aria-pressed", String(guideOn));
  draw();
});

resetSauce();
