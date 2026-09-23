/* ==================================================================
   DCITC PAGE FLUID  —  static/js/fluid-triangle.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The ASCII fluid that lives behind the WHOLE home page — a fixed
     full-viewport layer rendered once per frame, visible through the
     transparent sections while the filmstrip scrolls over it.

   PROVENANCE:
     This is javierbyte/fluid-triangle (MIT), adapted — NOT rewritten.
     The solver, constants, character ramps, diagonal banding,
     drag-the-triangle interaction and device-motion support are all
     upstream code. Fluid physics originally from "10 minute physics"
     (18-flip.html), Copyright 2022 Matthias Müller, MIT.

   ADAPTATIONS (kept to the minimum that makes it a background):
     - mounts into .page-fluid in index.html instead of owning <body>;
       bails immediately when the mount is absent (every page but home)
     - colors come from site tokens via CSS (.page-fluid rules in
       08-pages.css) so dark/light themes just work; the layer's
       background is the page itself, not upstream's pure black
     - pointer listeners live on window and never preventDefault:
       drags stir the fluid while wheel/keys/touch keep operating the
       filmstrip (index.html marks home's <main> [data-hx-nodrag] so
       horizontal.js hands mouse-drag control to the fluid)
     - device motion permission is only requested from inside a tap,
       denial is silent, gravity falls back to plain -9.81
     - resize re-runs setupScene after a debounce (upstream reloaded
       the whole page)
     - prefers-reduced-motion: one settled frame, no loop/listeners
     - dropped upstream dead weight: the never-enabled canvas pixel
       renderer, its <canvas>, p/m pause hotkeys, console.log spam
     - upstream quirk handled: setObstacle()'s grid-stamping loop read
       f.numX/f.numY (undefined) so it NEVER ran on the published site;
       it was a Ten Minute Physics leftover that carves a CIRCLE. We
       drop that body entirely (see setObstacle) — drag stirring works
       through handleParticleCollisions' moving triangle, exactly like
       javierbyte's live demo

   BEHAVIOUR: exactly one fluid.simulate() per animation frame (the
   original loop shape — no catch-up stepping, no quality governor).
   ================================================================== */
(function () {
  'use strict';

  var NS = (window.DCITC = window.DCITC || {});
  var mounted = false;

  /* ------------------------------------------------------------------
     upstream constants + character ramps (unchanged) */
  var TARGET_LONG_SIDE = 128 * 74;
  var MIN_GRID_SIZE = 8;
  var CELL_CROP_X = 1;
  var CELL_CROP_Y = 2;

  var BASE = [
    ['~', 12198],
    [':', 6921],
    ['-', 5589],
    ['·', 3267],
    [' ', 0],
    [' ', 0],
  ];

  var RENDER_CHARS = [
    [
      ['F', 26574],
      ['F', 26574],
      ['f', 17490],
    ].concat(BASE),
    [
      ['L', 21327],
      ['L', 21327],
      ['l', 14019],
    ].concat(BASE),
    [
      ['U', 32973],
      ['U', 32973],
      ['u', 24093],
    ].concat(BASE),
    [
      ['I', 14883],
      ['I', 14883],
      ['i', 13638],
    ].concat(BASE),
    [
      ['D', 36198],
      ['D', 36198],
      ['d', 30762],
    ].concat(BASE),
  ];

  var SPEED_1 = 1.0 / 60.0 / 16;
  var SPEED_BASE = 1.0 / 60.0 / 3;
  var SPEED_2 = 1.0 / 60.0 / 1.25;

  function clamp(x, min, max) {
    if (x < min) return min;
    else if (x > max) return max;
    else return x;
  }

  /* ================================================================
     FLIP simulator — upstream code (Ten Minute Physics / javierbyte),
     verbatim except: `gravityVector` is module-local, not on window.
     ================================================================ */
  var GRAVITY = -9.81;
  var gravityVector = null;

  function FlipFluid(density, width, height, spacing, particleRadius, maxParticles) {
    this.density = density;
    this.fNumX = Math.floor(width / spacing);
    this.fNumY = Math.floor(height / spacing);
    this.h = Math.max(width / this.fNumX, height / this.fNumY);
    this.fInvSpacing = 1.0 / this.h;
    this.fNumCells = this.fNumX * this.fNumY;

    this.u = new Float32Array(this.fNumCells);
    this.v = new Float32Array(this.fNumCells);
    this.du = new Float32Array(this.fNumCells);
    this.dv = new Float32Array(this.fNumCells);
    this.prevU = new Float32Array(this.fNumCells);
    this.prevV = new Float32Array(this.fNumCells);
    this.p = new Float32Array(this.fNumCells);
    this.s = new Float32Array(this.fNumCells);
    this.cellType = new Int32Array(this.fNumCells);
    this.cellColor = new Float32Array(3 * this.fNumCells);

    this.maxParticles = maxParticles;

    this.particlePos = new Float32Array(2 * this.maxParticles);
    this.particleVel = new Float32Array(2 * this.maxParticles);

    this.particleDensity = new Float32Array(this.fNumCells);
    this.particleRestDensity = 0.0;

    this.particleRadius = particleRadius;
    this.pInvSpacing = 1.0 / (2.2 * particleRadius);
    this.pNumX = Math.floor(width * this.pInvSpacing) + 1;
    this.pNumY = Math.floor(height * this.pInvSpacing) + 1;
    this.pNumCells = this.pNumX * this.pNumY;

    this.numCellParticles = new Int32Array(this.pNumCells);
    this.firstCellParticle = new Int32Array(this.pNumCells + 1);
    this.cellParticleIds = new Int32Array(maxParticles);

    this.numParticles = 0;
  }

  FlipFluid.prototype.integrateParticles = function (dt) {
    for (var i = 0; i < this.numParticles; i++) {
      var gravityX = 0;
      var gravityY = GRAVITY;
      if (gravityVector) {
        gravityX = gravityVector.x;
        gravityY = gravityVector.y;
      }
      this.particleVel[2 * i] += dt * gravityX;
      this.particleVel[2 * i + 1] += dt * gravityY;
      this.particlePos[2 * i] += this.particleVel[2 * i] * dt;
      this.particlePos[2 * i + 1] += this.particleVel[2 * i + 1] * dt;
    }
  };

  FlipFluid.prototype.pushParticlesApart = function (numIters) {
    var colorDiffusionCoeff = 0.001;

    // count particles per cell
    this.numCellParticles.fill(0);

    for (var i = 0; i < this.numParticles; i++) {
      var x = this.particlePos[2 * i];
      var y = this.particlePos[2 * i + 1];
      var xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
      var yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
      var cellNr = xi * this.pNumY + yi;
      this.numCellParticles[cellNr]++;
    }

    // partial sums
    var first = 0;
    for (var i2 = 0; i2 < this.pNumCells; i2++) {
      first += this.numCellParticles[i2];
      this.firstCellParticle[i2] = first;
    }
    this.firstCellParticle[this.pNumCells] = first; // guard

    // fill particles into cells
    for (var i3 = 0; i3 < this.numParticles; i3++) {
      var x3 = this.particlePos[2 * i3];
      var y3 = this.particlePos[2 * i3 + 1];
      var xi3 = clamp(Math.floor(x3 * this.pInvSpacing), 0, this.pNumX - 1);
      var yi3 = clamp(Math.floor(y3 * this.pInvSpacing), 0, this.pNumY - 1);
      var cellNr3 = xi3 * this.pNumY + yi3;
      this.firstCellParticle[cellNr3]--;
      this.cellParticleIds[this.firstCellParticle[cellNr3]] = i3;
    }

    // push particles apart
    var minDist = 2.0 * this.particleRadius;
    var minDist2 = minDist * minDist;

    for (var iter = 0; iter < numIters; iter++) {
      for (var i4 = 0; i4 < this.numParticles; i4++) {
        var px = this.particlePos[2 * i4];
        var py = this.particlePos[2 * i4 + 1];
        var pxi = Math.floor(px * this.pInvSpacing);
        var pyi = Math.floor(py * this.pInvSpacing);
        var x0 = Math.max(pxi - 1, 0);
        var y0 = Math.max(pyi - 1, 0);
        var x1 = Math.min(pxi + 1, this.pNumX - 1);
        var y1 = Math.min(pyi + 1, this.pNumY - 1);

        for (var xi4 = x0; xi4 <= x1; xi4++) {
          for (var yi4 = y0; yi4 <= y1; yi4++) {
            var cellNr4 = xi4 * this.pNumY + yi4;
            var first4 = this.firstCellParticle[cellNr4];
            var last = this.firstCellParticle[cellNr4 + 1];
            for (var j = first4; j < last; j++) {
              var id = this.cellParticleIds[j];
              if (id === i4) continue;
              var qx = this.particlePos[2 * id];
              var qy = this.particlePos[2 * id + 1];
              var dx = qx - px;
              var dy = qy - py;
              var d2 = dx * dx + dy * dy;
              if (d2 > minDist2 || d2 === 0.0) continue;
              var d = Math.sqrt(d2);
              var s = (0.5 * (minDist - d)) / d;
              dx *= s;
              dy *= s;
              this.particlePos[2 * i4] -= dx;
              this.particlePos[2 * i4 + 1] -= dy;
              this.particlePos[2 * id] += dx;
              this.particlePos[2 * id + 1] += dy;
            }
          }
        }
      }
    }
  };

  FlipFluid.prototype.handleParticleCollisions = function (obstacleX, obstacleY, obstacleRadius) {
    var h = 1.0 / this.fInvSpacing;
    var r = this.particleRadius;

    var minX = h + r;
    var maxX = (this.fNumX - 1) * h - r;
    var minY = h + r;
    var maxY = (this.fNumY - 1) * h - r;

    for (var i = 0; i < this.numParticles; i++) {
      var x = this.particlePos[2 * i];
      var y = this.particlePos[2 * i + 1];

      // triangle obstacle vertices from centre + radius (upstream)
      var trianglePoints = [
        { x: obstacleX, y: obstacleY + obstacleRadius },
        {
          x: obstacleX - obstacleRadius * Math.cos(Math.PI / 6),
          y: obstacleY - obstacleRadius * Math.sin(Math.PI / 6),
        },
        {
          x: obstacleX + obstacleRadius * Math.cos(Math.PI / 6),
          y: obstacleY - obstacleRadius * Math.sin(Math.PI / 6),
        },
      ];

      function pointInTriangle(px, py, v1, v2, v3) {
        var d1 = sign(px, py, v1.x, v1.y, v2.x, v2.y);
        var d2 = sign(px, py, v2.x, v2.y, v3.x, v3.y);
        var d3 = sign(px, py, v3.x, v3.y, v1.x, v1.y);
        var hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        var hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(hasNeg && hasPos);
      }
      function sign(px, py, x1, y1, x2, y2) {
        return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
      }

      if (pointInTriangle(x, y, trianglePoints[0], trianglePoints[1], trianglePoints[2])) {
        // closest point on the triangle, then push the particle out
        var closestPoint = { x: x, y: y };
        var minDist = Number.MAX_VALUE;
        for (var e = 0; e < 3; e++) {
          var p1 = trianglePoints[e];
          var p2 = trianglePoints[(e + 1) % 3];
          var edge = { x: p2.x - p1.x, y: p2.y - p1.y };
          var point = { x: x - p1.x, y: y - p1.y };
          var len = edge.x * edge.x + edge.y * edge.y;
          var t = Math.max(0, Math.min(1, (point.x * edge.x + point.y * edge.y) / len));
          var proj = { x: p1.x + t * edge.x, y: p1.y + t * edge.y };
          var dist = Math.sqrt((x - proj.x) * (x - proj.x) + (y - proj.y) * (y - proj.y));
          if (dist < minDist) {
            minDist = dist;
            closestPoint = proj;
          }
        }
        var dx = x - closestPoint.x;
        var dy = y - closestPoint.y;
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > 0) {
          x = closestPoint.x;
          y = closestPoint.y;
        }
        this.particleVel[2 * i] = 0;
        this.particleVel[2 * i + 1] = 0;
      }

      // wall collisions
      if (x < minX) {
        x = minX;
        this.particleVel[2 * i] = 0.0;
      }
      if (x > maxX) {
        x = maxX;
        this.particleVel[2 * i] = 0.0;
      }
      if (y < minY) {
        y = minY;
        this.particleVel[2 * i + 1] = 0.0;
      }
      if (y > maxY) {
        y = maxY;
        this.particleVel[2 * i + 1] = 0.0;
      }
      this.particlePos[2 * i] = x;
      this.particlePos[2 * i + 1] = y;
    }
  };

  FlipFluid.prototype.updateParticleDensity = function () {
    var n = this.fNumY;
    var h = this.h;
    var h1 = this.fInvSpacing;
    var h2 = 0.5 * h;
    var d = this.particleDensity;
    d.fill(0.0);

    for (var i = 0; i < this.numParticles; i++) {
      var x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
      var y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);
      var x0 = Math.floor((x - h2) * h1);
      var tx = (x - h2 - x0 * h) * h1;
      var x1 = Math.min(x0 + 1, this.fNumX - 2);
      var y0 = Math.floor((y - h2) * h1);
      var ty = (y - h2 - y0 * h) * h1;
      var y1 = Math.min(y0 + 1, this.fNumY - 2);
      var sx = 1.0 - tx;
      var sy = 1.0 - ty;
      if (x0 < this.fNumX && y0 < this.fNumY) d[x0 * n + y0] += sx * sy;
      if (x1 < this.fNumX && y0 < this.fNumY) d[x1 * n + y0] += tx * sy;
      if (x1 < this.fNumX && y1 < this.fNumY) d[x1 * n + y1] += tx * ty;
      if (x0 < this.fNumX && y1 < this.fNumY) d[x0 * n + y1] += sx * ty;
    }

    if (this.particleRestDensity === 0.0) {
      var sum = 0.0;
      var numFluidCells = 0;
      for (var c = 0; c < this.fNumCells; c++) {
        if (this.cellType[c] === FLUID_CELL) {
          sum += d[c];
          numFluidCells++;
        }
      }
      if (numFluidCells > 0) this.particleRestDensity = sum / numFluidCells;
    }
  };

  FlipFluid.prototype.transferVelocities = function (toGrid, flipRatio) {
    var n = this.fNumY;
    var h = this.h;
    var h1 = this.fInvSpacing;
    var h2 = 0.5 * h;

    if (toGrid) {
      this.prevU.set(this.u);
      this.prevV.set(this.v);
      this.du.fill(0.0);
      this.dv.fill(0.0);
      this.u.fill(0.0);
      this.v.fill(0.0);
      for (var ci = 0; ci < this.fNumCells; ci++)
        this.cellType[ci] = this.s[ci] === 0.0 ? SOLID_CELL : AIR_CELL;
      for (var pi = 0; pi < this.numParticles; pi++) {
        var pxi = clamp(Math.floor(this.particlePos[2 * pi] * h1), 0, this.fNumX - 1);
        var pyi = clamp(Math.floor(this.particlePos[2 * pi + 1] * h1), 0, this.fNumY - 1);
        var pc = pxi * n + pyi;
        if (this.cellType[pc] === AIR_CELL) this.cellType[pc] = FLUID_CELL;
      }
    }

    for (var component = 0; component < 2; component++) {
      var dx = component === 0 ? 0.0 : h2;
      var dy = component === 0 ? h2 : 0.0;
      var f = component === 0 ? this.u : this.v;
      var prevF = component === 0 ? this.prevU : this.prevV;
      var d = component === 0 ? this.du : this.dv;

      for (var i = 0; i < this.numParticles; i++) {
        var x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
        var y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);
        var x0 = Math.min(Math.floor((x - dx) * h1), this.fNumX - 2);
        var tx = (x - dx - x0 * h) * h1;
        var x1 = Math.min(x0 + 1, this.fNumX - 2);
        var y0 = Math.min(Math.floor((y - dy) * h1), this.fNumY - 2);
        var ty = (y - dy - y0 * h) * h1;
        var y1 = Math.min(y0 + 1, this.fNumY - 2);
        var sx = 1.0 - tx;
        var sy = 1.0 - ty;
        var d0 = sx * sy;
        var d1 = tx * sy;
        var d2 = tx * ty;
        var d3 = sx * ty;
        var nr0 = x0 * n + y0;
        var nr1 = x1 * n + y0;
        var nr2 = x1 * n + y1;
        var nr3 = x0 * n + y1;

        if (toGrid) {
          var pv = this.particleVel[2 * i + component];
          f[nr0] += pv * d0;
          d[nr0] += d0;
          f[nr1] += pv * d1;
          d[nr1] += d1;
          f[nr2] += pv * d2;
          d[nr2] += d2;
          f[nr3] += pv * d3;
          d[nr3] += d3;
        } else {
          var offset = component === 0 ? n : 1;
          var valid0 =
            this.cellType[nr0] !== AIR_CELL || this.cellType[nr0 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var valid1 =
            this.cellType[nr1] !== AIR_CELL || this.cellType[nr1 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var valid2 =
            this.cellType[nr2] !== AIR_CELL || this.cellType[nr2 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var valid3 =
            this.cellType[nr3] !== AIR_CELL || this.cellType[nr3 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var v = this.particleVel[2 * i + component];
          var dv = valid0 * d0 + valid1 * d1 + valid2 * d2 + valid3 * d3;
          if (dv > 0.0) {
            var picV =
              (valid0 * d0 * f[nr0] +
                valid1 * d1 * f[nr1] +
                valid2 * d2 * f[nr2] +
                valid3 * d3 * f[nr3]) /
              dv;
            var corr =
              (valid0 * d0 * (f[nr0] - prevF[nr0]) +
                valid1 * d1 * (f[nr1] - prevF[nr1]) +
                valid2 * d2 * (f[nr2] - prevF[nr2]) +
                valid3 * d3 * (f[nr3] - prevF[nr3])) /
              dv;
            var flipV = v + corr;
            this.particleVel[2 * i + component] = (1.0 - flipRatio) * picV + flipRatio * flipV;
          }
        }
      }

      if (toGrid) {
        for (var fi = 0; fi < f.length; fi++) if (d[fi] > 0.0) f[fi] /= d[fi];
        // restore solid cells
        for (var ix = 0; ix < this.fNumX; ix++) {
          for (var jy = 0; jy < this.fNumY; jy++) {
            var solid = this.cellType[ix * n + jy] === SOLID_CELL;
            if (solid || (ix > 0 && this.cellType[(ix - 1) * n + jy] === SOLID_CELL))
              this.u[ix * n + jy] = this.prevU[ix * n + jy];
            if (solid || (jy > 0 && this.cellType[ix * n + jy - 1] === SOLID_CELL))
              this.v[ix * n + jy] = this.prevV[ix * n + jy];
          }
        }
      }
    }
  };

  FlipFluid.prototype.solveIncompressibility = function (
    numIters,
    dt,
    overRelaxation,
    compensateDrift,
  ) {
    this.p.fill(0.0);
    this.prevU.set(this.u);
    this.prevV.set(this.v);

    var n = this.fNumY;
    var cp = (this.density * this.h) / dt;

    for (var iter = 0; iter < numIters; iter++) {
      for (var i = 1; i < this.fNumX - 1; i++) {
        for (var j = 1; j < this.fNumY - 1; j++) {
          if (this.cellType[i * n + j] !== FLUID_CELL) continue;
          var center = i * n + j;
          var left = (i - 1) * n + j;
          var right = (i + 1) * n + j;
          var bottom = i * n + j - 1;
          var top = i * n + j + 1;
          var s = this.s[left] + this.s[right] + this.s[bottom] + this.s[top];
          if (s === 0.0) continue;
          var div = this.u[right] - this.u[center] + this.v[top] - this.v[center];
          if (this.particleRestDensity > 0.0 && compensateDrift) {
            var k = 1.0;
            var compression = this.particleDensity[i * n + j] - this.particleRestDensity;
            if (compression > 0.0) div = div - k * compression;
          }
          var p = -div / s;
          p *= overRelaxation;
          this.p[center] += cp * p;
          this.u[center] -= this.s[left] * p;
          this.u[right] += this.s[right] * p;
          this.v[center] -= this.s[bottom] * p;
          this.v[top] += this.s[top] * p;
        }
      }
    }
  };

  FlipFluid.prototype.updateCellColors = function () {
    this.cellColor.fill(0.0);
    for (var i = 0; i < this.fNumCells; i++) {
      if (this.cellType[i] === SOLID_CELL) {
        this.cellColor[3 * i] = 0.5;
        this.cellColor[3 * i + 1] = 0.5;
        this.cellColor[3 * i + 2] = 0.5;
      } else if (this.cellType[i] === FLUID_CELL) {
        var d = this.particleDensity[i];
        if (this.particleRestDensity > 0.0) d /= this.particleRestDensity;
        var val = Math.min(Math.max(d, 0.0), 2.0 - 0.0001);
        val = val / 2.0;
        var m = 0.25;
        var num = Math.floor(val / m);
        var s = (val - num * m) / m;
        var g = num % 2 === 0 ? s : 1.0 - s; // upstream saw-band, condensed
        this.cellColor[3 * i] = g;
        this.cellColor[3 * i + 1] = g;
        this.cellColor[3 * i + 2] = g;
      }
    }
  };

  FlipFluid.prototype.simulate = function (
    dt,
    gravity,
    flipRatio,
    numPressureIters,
    numParticleIters,
    overRelaxation,
    compensateDrift,
    separateParticles,
    obstacleX,
    obstacleY,
    obstacleRadius,
  ) {
    var numSubSteps = 1;
    var sdt = dt / numSubSteps;
    for (var step = 0; step < numSubSteps; step++) {
      this.integrateParticles(sdt);
      if (separateParticles) this.pushParticlesApart(numParticleIters);
      this.handleParticleCollisions(obstacleX, obstacleY, obstacleRadius);
      this.transferVelocities(true);
      this.updateParticleDensity();
      this.solveIncompressibility(numPressureIters, sdt, overRelaxation, compensateDrift);
      this.transferVelocities(false, flipRatio);
    }
    this.updateCellColors();
  };

  var FLUID_CELL = 0;
  var AIR_CELL = 1;
  var SOLID_CELL = 2;

  /* ================================================================
     scene + main loop — upstream structure (one simulate per frame)
     ================================================================ */
  var scene = {
    gravity: GRAVITY,
    dt: SPEED_BASE,
    flipRatio: 0.9,
    numPressureIters: 30,
    numParticleIters: 2,
    overRelaxation: 1.9,
    compensateDrift: true,
    separateParticles: true,
    obstacleX: 0.0,
    obstacleY: 0.0,
    obstacleRadius: 0,
    paused: true,
    fluid: null,
  };

  var GRID_SIZE = MIN_GRID_SIZE;
  var renderEl = null;

  function computeGrid() {
    GRID_SIZE = Math.max(
      Math.round(Math.sqrt((window.innerWidth * window.innerHeight) / TARGET_LONG_SIDE)),
      MIN_GRID_SIZE,
    );
  }

  function realWidth() {
    return Math.ceil(window.innerWidth / GRID_SIZE + CELL_CROP_X * 2) * GRID_SIZE;
  }
  function realHeight() {
    return Math.ceil(window.innerHeight / GRID_SIZE + CELL_CROP_Y * 2) * GRID_SIZE;
  }

  var Y_RESOLUTION = 0;
  var RESOLUTION = 0;
  var simHeight = 2.0;
  var cScale = 1;
  var simWidth = 0;
  var f = null;

  function setupScene() {
    computeGrid();
    var rw = realWidth();
    var rh = realHeight();
    Y_RESOLUTION = rh / GRID_SIZE;
    RESOLUTION = Y_RESOLUTION;

    cScale = rh / simHeight;
    simWidth = rw / cScale;

    if (renderEl) {
      // explicit box like upstream — the y-flip in simCoords() relies on
      // the element filling the simulation rect exactly
      renderEl.style.width = realWidth() + 'px';
      renderEl.style.height = realHeight() + 'px';
      renderEl.style.setProperty('font-size', GRID_SIZE + 'px');
      renderEl.style.lineHeight = GRID_SIZE + 'px';
    }

    var res = RESOLUTION;
    var tankHeight = 1.0 * simHeight;
    var tankWidth = 1.0 * simWidth;
    var h = tankHeight / res;
    var density = 1000.0;
    var relWaterHeight = 0.618;
    var relWaterWidth = 1;

    // dam break particle grid (upstream)
    var r = 0.3 * h;
    var dx = 2.0 * r;
    var dy = (Math.sqrt(3.0) / 2.0) * dx;
    var numX = Math.floor((relWaterWidth * tankWidth - 2.0 * h - 2.0 * r) / dx);
    var numY = Math.floor((relWaterHeight * tankHeight - 2.0 * h - 2.0 * r) / dy);
    var maxParticles = numX * numY;

    f = scene.fluid = new FlipFluid(density, tankWidth, tankHeight, h, r, maxParticles);

    f.numParticles = numX * numY;
    var p = 0;
    for (var i = 0; i < numX; i++) {
      for (var j = 0; j < numY; j++) {
        var xOffset = (tankWidth - numX * dx) / 2;
        var yOffset = (tankHeight - numY * dy) * -0.5;
        f.particlePos[p++] = h + r + dx * i + (j % 2 === 0 ? 0.0 : r) + xOffset;
        f.particlePos[p++] = h + r + dy * j + yOffset;
      }
    }

    // tank cells: solid left/right/bottom rim, open top (upstream)
    var n = f.fNumY;
    for (var ix = 0; ix < f.fNumX; ix++) {
      for (var jy = 0; jy < f.fNumY; jy++) {
        var s = 1.0;
        if (ix === 0 || ix === f.fNumX - 1 || jy === 0) s = 0.0;
        f.s[ix * n + jy] = s;
      }
    }
  }

  /* setObstacle only tracks the pointer-driven obstacle position.
     Upstream also carried a grid-stamping loop inherited from the Ten
     Minute Physics demo that carved a CIRCLE of solid cells — but it
     read f.numX/f.numY (undefined), so on javierbyte's published site
     it never executed and his demo's water only ever interacts with
     the moving TRIANGLE via handleParticleCollisions(). Restoring that
     loop (our first pass) resurrected a growing disc mid-screen; to
     match the original's visible behaviour we drop the stamping and
     keep just the position/velocity bookkeeping. */
  function setObstacle(x, y, reset) {
    var vx = 0.0;
    var vy = 0.0;
    if (!reset) {
      vx = (x - scene.obstacleX) / scene.dt;
      vy = (y - scene.obstacleY) / scene.dt;
    }
    scene.obstacleX = x;
    scene.obstacleY = y;
  }

  /* --- interaction (upstream model, window-scoped listeners) -------- */
  var mouseDown = false;

  function simCoords(clientX, clientY) {
    var rect = renderEl.getBoundingClientRect();
    var mx = clientX - rect.left;
    var my = clientY - rect.top;
    return {
      x: mx / cScale,
      y: (rect.height - my) / cScale,
    };
  }

  function startDrag(clientX, clientY) {
    mouseDown = true;
    document.body.classList.add('is-fluid-grabbing');
    var c = simCoords(clientX, clientY);
    setObstacle(c.x, c.y, true);
    scene.paused = false;
  }

  function drag(clientX, clientY) {
    if (!mouseDown) return;
    var c = simCoords(clientX, clientY);
    setObstacle(c.x, c.y, false);
  }

  function endDrag() {
    mouseDown = false;
    document.body.classList.remove('is-fluid-grabbing');
  }

  function onMouseDown(e) {
    if (e.button !== 0 || reduced.matches) return;
    scene.obstacleRadius = 0.0;
    scene.dt = SPEED_1;
    startDrag(e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    drag(e.clientX, e.clientY);
  }
  function onMouseUp() {
    scene.dt = SPEED_2;
    endDrag();
  }
  function onTouchStart(e) {
    if (!e.touches.length || reduced.matches) return;
    scene.obstacleRadius = 0.0;
    scene.dt = SPEED_1;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }
  function onTouchMove(e) {
    if (!mouseDown || !e.touches.length) return;
    drag(e.touches[0].clientX, e.touches[0].clientY); // passive: strip pans too
  }
  function onTouchEnd() {
    scene.dt = SPEED_2;
    endDrag();
  }

  /* --- device motion (upstream, permission only inside a gesture) ---- */
  function requestDeviceMotion() {
    if (
      typeof window.DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
      DeviceMotionEvent.requestPermission()
        .then(function (permission) {
          if (permission === 'granted') setupDeviceMotion();
        })
        .catch(function () {
          /* denied → default gravity */
        });
    } else if (typeof window.DeviceMotionEvent !== 'undefined') {
      setupDeviceMotion();
    }
  }

  function setupDeviceMotion() {
    window.addEventListener('devicemotion', function (event) {
      var a = event.accelerationIncludingGravity;
      if (!a || (a.x == null && a.y == null)) return;
      var x = a.x || 0;
      var y = a.y || 0;
      if (!x && !y) return;
      // screen-orientation compensation (modern API + legacy fallback)
      var angle = 0;
      if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number')
        angle = screen.orientation.angle;
      else if (typeof window.orientation === 'number') angle = window.orientation;
      if (angle === 90) {
        var t = x;
        x = -y;
        y = t;
      } else if (angle === -90 || angle === 270) {
        var t2 = x;
        x = y;
        y = -t2;
      } else if (angle === 180 || angle === -180) {
        x = -x;
        y = -y;
      }
      gravityVector = { x: x, y: y };
      scene.gravity = 0;
    });
  }

  /* --- main loop: ONE simulate + ONE render per RENDERED frame.
         Rendered frames are capped at ~30fps by skipping whole frames
         (a skipped frame does NO sim work — no catch-up debt). The
         render goes through textContent instead of upstream's
         innerHTML: the field is plain ASCII, so per-frame HTML parsing
         is pure overhead. --- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rafId = null;
  var FRAME_MIN_MS = 1000 / 30;
  var lastFrameT = 0;

  function update(now) {
    rafId = null;
    if (!pausedForever && now - lastFrameT < FRAME_MIN_MS) {
      rafId = requestAnimationFrame(update);
      return;
    }
    lastFrameT = now;
    var MAX_RADIUS = window.innerWidth > window.innerHeight ? 0.47 : 0.37;
    scene.obstacleRadius = (scene.obstacleRadius * 3 + MAX_RADIUS) / 4;

    if (!scene.paused) {
      scene.fluid.simulate(
        scene.dt,
        scene.gravity,
        scene.flipRatio,
        scene.numPressureIters,
        scene.numParticleIters,
        scene.overRelaxation,
        scene.compensateDrift,
        scene.separateParticles,
        scene.obstacleX,
        scene.obstacleY,
        scene.obstacleRadius,
      );
    }

    // ASCII render into the layer's <pre> (upstream innerHTML path;
    // dictionaries are pre-sorted once here instead of per cell)
    var toRender = '';
    for (var i = f.fNumY - CELL_CROP_Y; i > CELL_CROP_Y; i--) {
      var row = '';
      for (var j = CELL_CROP_X; j < f.fNumX - CELL_CROP_X; j++) {
        var dict = RENDER_DICTS[(i + j + 1) % RENDER_DICTS.length];
        var cellColor = f.cellColor[3 * (j * f.fNumY + i)];
        row += dict[Math.floor(cellColor * dict.length)];
      }
      toRender += row + '\n';
    }
    renderEl.textContent = toRender;

    if (!pausedForever) {
      if (settleFrames > 0) {
        // reduced-motion settle: count down, then halt the loop
        if (--settleFrames === 0) {
          pausedForever = true;
          scene.paused = true;
        }
      }
      if (!pausedForever) rafId = requestAnimationFrame(update);
    }
  }

  var RENDER_DICTS = RENDER_CHARS.map(function (ramp) {
    return ramp
      .slice()
      .sort(function (a, b) {
        return a[1] - b[1];
      })
      .map(function (pair) {
        return pair[0];
      })
      .join('');
  });

  var pausedForever = false; // set once the loop must stop for good
  var settleFrames = 0; // >0 while reduced-motion settling

  /* --- desktop-only gate + start/stop lifecycle ---
     The fluid runs on pointer/desktop viewports only (site breakpoint
     900px): mobile CPUs and batteries shouldn't pay for a background
     toy. The gate is live — crossing 900px boots or stops the loop, so
     tablet orientation changes behave too. Below 900px nothing is
     mounted and zero listeners are bound. --- */
  var DESKTOP_MQ = window.matchMedia('(min-width: 900px)');
  var listenersBound = false;

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    // interaction — on window so the fluid reacts everywhere on the
    // page even though the layer sits behind the content
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    // device motion: upstream gesture-gated request (never at load)
    var motionOnce = function () {
      window.removeEventListener('mousedown', motionOnce);
      window.removeEventListener('touchend', motionOnce);
      requestDeviceMotion();
    };
    window.addEventListener('mousedown', motionOnce, { once: true });
    window.addEventListener('touchend', motionOnce, { once: true });

    // resize → soft rebuild (upstream did location.reload()); inert
    // while stopped on a sub-900px viewport
    var resizeTimer;
    window.addEventListener('resize', function () {
      if (!DESKTOP_MQ.matches) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        setupScene();
        startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
        endDrag();
      }, 250);
    });
  }

  function start() {
    if (!renderEl) {
      var mount = document.querySelector('[data-fluid-triangle]');
      if (!mount) return;
      renderEl = document.createElement('div');
      renderEl.className = 'render';
      mount.appendChild(renderEl);
    }
    setupScene();
    bindListeners();
    pausedForever = false;

    if (reduced.matches) {
      // prefers-reduced-motion: no permanent animation. Run a SHORT
      // async settle burst so the opening frame looks calm, then stop
      // the loop for good.
      settleFrames = 60;
      scene.paused = false;
      startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
      endDrag();
      rafId = requestAnimationFrame(update);
      return;
    }

    // draw the initial obstacle + start the capped upstream-style loop
    startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
    endDrag();
    scene.paused = false;
    rafId = requestAnimationFrame(update);
  }

  function stopAll() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    scene.paused = true;
    pausedForever = true;
    if (renderEl) renderEl.textContent = '';
  }

  function onDesktopGate(e) {
    if (e.matches && mounted) start();
    else if (!e.matches) stopAll();
  }

  var gateBound = false;

  // RE-RUNNABLE (soft navigation): a fresh init() after a DOM swap
  // re-targets the layer element; the mq gate is wired at most once so
  // breakpoint crossings keep working across page changes. Pages without
  // [data-fluid-triangle] (everything but home) halt the loop and clear
  // the layer.
  function init() {
    var el = document.querySelector('[data-fluid-triangle]');
    renderEl = el ? el.querySelector('.render') : null;

    if (!gateBound) {
      gateBound = true;
      DESKTOP_MQ.addEventListener('change', onDesktopGate);
    }

    if (!el) {
      stopAll();
      return;
    }

    if (!mounted) {
      mounted = true;
      gravityVector = null; // fresh orientation baseline
    }
    if (DESKTOP_MQ.matches) start();
    else if (!DESKTOP_MQ.matches) stopAll(); // e.g. tablet → desktop flip then back
  }

  NS.fluidTriangle = { init: init };
})();
