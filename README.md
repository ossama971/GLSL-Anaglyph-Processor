# GLSL Anaglyph Processor

A real-time video processing and anaglyph generation tool built with Three.js and WebGL 2 / GLSL 3. Implements GPU-accelerated image filters on live video frames and composites stereoscopic anaglyph images — all in the browser with no backend.

**Live demo:** https://ossama971.github.io/GLSL-Anaglyph-Processor/

---

## Overview

The application renders a looping video onto three Three.js planes:

| Plane | Role |
|---|---|
| Top | Left-eye source — independently filterable |
| Bottom | Right-eye source — independently filterable |
| Anaglyph | Composited stereo output from the two sources |

Each frame the GPU runs a processing shader on each source plane, then feeds the results into the stereo compositor, which outputs one of five anaglyph methods.

---

## Image Processing Methods (Task 1)

All filters are implemented as GLSL 3 fragment shaders in [`src/shaders/processorFragment.glsl`](src/shaders/processorFragment.glsl). They run in a render-to-texture loop via [`TextureProcessor`](src/TextureProcessor.js). Only one filter can be active per plane at a time; switching off a filter reverts to the raw video texture.

### 1. 2D Gaussian Blur

A full 2D convolution using the Gaussian kernel:

$$G(x,y) = e^{-\frac{x^2+y^2}{2\sigma^2}}$$

Weights are computed on-the-fly in the shader and normalised so they sum to 1. Pixel access uses `texelFetch` at integer coordinates; out-of-bounds samples are clamped to edge.

**Complexity:** O(k²) texture fetches per pixel, where k = 2r + 1.

**Parameters exposed in GUI:**
- **Kernel Radius** — r ∈ {1, 3, 5, 7} (kernel size 3, 7, 11, 15)
- **Sigma** — σ ∈ [0.5, 5.0]

### 2. Laplacian Filter

A second-order derivative edge detector approximating ∇²I = ∂²I/∂x² + ∂²I/∂y². Uses the 4-connected 3×3 kernel:

```
 0  1  0
 1 -4  1
 0  1  0
```

Two output modes selectable in the GUI:
- **Color** — applies the kernel independently to R, G, B; maps the signed result through `abs()` for display.
- **Normal** — computes the Euclidean norm √(L²R + L²G + L²B) and outputs a greyscale value.

**Parameters exposed in GUI:** Visualization Mode (Color / Normal)

### 3. Separable Gaussian Blur

Exploits the separability of the 2D Gaussian kernel — decomposes it into two successive 1D passes:

```
G2D(x,y) = G1D(x) · G1D(y)   where   G1D(t) = e^(-t²/2σ²)
```

**Two-pass pipeline (both passes share one shader, toggled by `horizontalFlag`):**

1. **Pass 1 (horizontal):** 1D horizontal convolution → intermediate `WebGLRenderTarget`
2. **Pass 2 (vertical):** 1D vertical convolution reading from the intermediate target → final render target

**Complexity:** O(2k) texture fetches vs. O(k²) for the 2D variant — significantly faster for large kernels.

**Parameters exposed in GUI:** same Kernel Radius and Sigma controls as the 2D Gaussian.

### 4. Median Denoising

A non-linear 3×3 median filter that excels at removing salt-and-pepper noise while preserving edges. Collects 9 neighbourhood samples per channel, then finds the median using a hand-coded optimal sorting network (25 comparisons for 9 elements — no built-in sort is available in GLSL).

**Per-channel pipeline:** independent sort on R, G, B arrays → median is element at index 4.

**Filter summary:**

| # | Method | Type | Complexity | Passes |
|---|---|---|---|---|
| 1 | Gaussian Blur | Linear, 2D | O(k²) | 1 |
| 2 | Laplacian | Linear, 2D | O(9) fixed | 1 |
| 3 | Separable Gaussian | Linear, 1D×2 | O(2k) | 2 |
| 4 | Median Denoising | Non-linear | O(9) fixed | 1 |

---

## Anaglyph Methods (Task 2)

All five methods are implemented in [`src/shaders/stereoFragment.glsl`](src/shaders/stereoFragment.glsl) and selected exclusively via the GUI. Each method is a linear combination of left and right pixel vectors through 3×3 matrices ML and MR:

```
[Ra, Ga, Ba]ᵀ = ML · [Rl, Gl, Bl]ᵀ + MR · [Rr, Gr, Br]ᵀ
```

The shader applies a ±4-pixel horizontal disparity between the left and right samples to simulate stereo parallax from the same source video.

### 1. True Anaglyph (Monochrome)

Both views converted to greyscale (ITU-R BT.601 luminance weights) before channel assignment. Minimal ghosting, no retinal rivalry, but dark and monochrome.

```
ML = diag(0.299, 0.587, 0.114) × [1, 0, 0]ᵀ    MR = luma → [0, G, B] channels
```

### 2. Gray Anaglyph

Left eye → greyscale red channel; right eye → original green and blue. Brighter than True Anaglyph at the cost of slightly more ghosting.

### 3. Color Anaglyph

Direct channel split: left red channel + right green/blue channels. Best color reproduction but severe retinal rivalry.

```
ML = diag(1, 0, 0)    MR = diag(0, 1, 1)
```

### 4. Half-Color Anaglyph

Compromise: left → greyscale red (reduced rivalry), right → original green/blue (preserved color).

### 5. Optimized Anaglyph — Dubois Method

Least-squares projection in perceptual color space, accounting for the spectral characteristics of the display and red/cyan glasses. Produces the best balance of color fidelity, depth perception, and minimal retinal rivalry. Output is clamped to [0, 1].

```
ML = ⎡  0.437   0.449   0.164 ⎤    MR = ⎡ -0.011  -0.032  -0.007 ⎤
     ⎢ -0.062  -0.062  -0.024 ⎥         ⎢  0.377   0.761   0.009 ⎥
     ⎣ -0.048  -0.050  -0.017 ⎦         ⎣ -0.026  -0.093   1.234 ⎦
```

**Anaglyph comparison:**

| # | Method | Color | Rivalry | Ghosting |
|---|---|---|---|---|
| 1 | True Anaglyph | None | None | Low |
| 2 | Gray Anaglyph | None | None | Medium |
| 3 | Color Anaglyph | Good | Severe | Low |
| 4 | Half-Color | Moderate | Low | Low |
| 5 | Dubois Optimized | Best | Minimal | Low |

Reference: [3DTV AnaglyphComparison](https://3dtv.at/Knowhow/AnaglyphComparison_en.aspx)

---

## Full Processing Pipeline

```
Video frame
    └─► Top plane (Left eye)   ─► Processing shader (optional filter) ─► leftTexture
    └─► Bottom plane (Right eye) ► Processing shader (optional filter) ─► rightTexture
                                                                              │
                                                                     Stereo compositor
                                                                              │
                                                                     Anaglyph output plane
```

---

## Architecture

### Rendering

| Component | Description |
|---|---|
| `TextureProcessor` | Offscreen render-to-texture pass using an orthographic camera over a full-screen quad. Holds a primary and intermediate `WebGLRenderTarget` for two-pass filters. |
| `RawShaderMaterial` | All shaders use GLSL 3 (`glslVersion: THREE.GLSL3`) with explicit `in`/`out` declarations. |
| `VideoTexture` | Live video decoded by the browser's media engine; uploaded to GPU each frame. `NearestFilter` on both min and mag to avoid interpolation artefacts when `texelFetch` is used. |
| OrbitControls | Camera navigation; the three planes are positioned at different Z depths so the anaglyph plane floats in front of the source planes. |

### Shader Inputs

**processorFragment.glsl uniforms:**

| Uniform | Type | Description |
|---|---|---|
| `imageTexture` | `sampler2D` | Input video (or intermediate) texture |
| `gaussian` | `bool` | Enable 2D Gaussian blur |
| `k` | `int` | Gaussian kernel half-radius |
| `sigma` | `float` | Gaussian σ |
| `laplacian` | `bool` | Enable Laplacian filter |
| `visualizationMode` | `int` | 0 = Color, 1 = Normal (greyscale norm) |
| `separableGaussian` | `bool` | Enable separable Gaussian |
| `separableK` | `int` | Separable kernel half-radius |
| `separableSigma` | `float` | Separable σ |
| `horizontalFlag` | `bool` | Pass direction for separable filter |
| `denoising` | `bool` | Enable median denoising |

**stereoFragment.glsl uniforms:**

| Uniform | Type | Description |
|---|---|---|
| `leftTexture` | `sampler2D` | Left-eye processed frame |
| `rightTexture` | `sampler2D` | Right-eye processed frame |
| `trueAnaglyph` | `bool` | True anaglyph method |
| `grayAnaglyph` | `bool` | Gray anaglyph method |
| `colorAnaglyph` | `bool` | Color anaglyph method |
| `halfColorAnaglyph` | `bool` | Half-color anaglyph method |
| `optimizedAnaglyph` | `bool` | Dubois optimized method |

---

## File Structure

```
GLSL-Anaglyph-Processor/
├── index.html                   # Entry point — import map for Three.js
├── video-lowQ.mp4               # Sample video (looping, muted)
└── src/
    ├── main.js                  # App init, Three.js scene, GUI setup
    ├── TextureProcessor.js      # Offscreen render-to-texture helper
    ├── config/
    │   └── uniforms.js          # Uniform definitions and filter mode defaults
    ├── shaders/
    │   ├── vertex.glsl          # Pass-through vertex shader
    │   ├── processorFragment.glsl   # All image processing filters
    │   ├── stereoFragment.glsl      # All anaglyph compositing methods
    │   └── loadShaders.js       # Fetches .glsl files at runtime
    └── styles/
        └── app.css              # Full-viewport canvas, no margin
```

---

## Dependencies

Loaded via CDN import map (no build step required):

| Library | Version | Purpose |
|---|---|---|
| [Three.js](https://threejs.org) | 0.184.0 | WebGL renderer, scene graph, materials |
| [lil-gui](https://lil-gui.georgealways.com) | bundled with Three.js addons | Parameter GUI |
| [OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls) | bundled with Three.js addons | Camera navigation |
| [es-module-shims](https://github.com/guybedford/es-module-shims) | 1.3.6 | Import map polyfill for older browsers |

---

## Running Locally

Because shaders are loaded via `fetch`, the app must be served over HTTP (not `file://`):

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .

# VS Code
# Install "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8080`.

---

## Controls

| Control | Action |
|---|---|
| **Active Plane** | Switch GUI edits between Top (left eye) and Bottom (right eye) |
| **Gaussian Blur** | Toggle 2D Gaussian on the active plane |
| **Separable Gaussian** | Toggle separable (two-pass) Gaussian on the active plane |
| **Laplacian Filter** | Toggle Laplacian edge detection |
| **Visualization Mode** | Color or Normal (greyscale norm) for Laplacian |
| **Enable Denoising** | Toggle 3×3 median filter |
| **Kernel Radius / Sigma** | Adjust blur parameters |
| **Anaglyph Visualization** | Select one of five anaglyph methods (exclusive) |
| **Play / Pause** | Toggle video playback |
| **Skip +10s** | Jump forward 10 seconds |
| **Orbit drag** | Rotate camera |
| **Scroll / pinch** | Zoom (0.005 – 2.0 units) |

---

## Academic Context

Developed as a 2-day sprint for the **Master IMLEX/COSI — Real-Time 3D-XR Visualization** course. Tasks covered:

1. Real-time GPU image processing (Gaussian, Laplacian, Separable Gaussian, Median)
2. Color-filtered anaglyph generation (True, Gray, Color, Half-Color, Dubois Optimized)
3. Stereoscopic depth simulation via horizontal disparity on a shared video source
