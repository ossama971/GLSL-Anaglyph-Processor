import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import WEBGL from "three/addons/capabilities/WebGL.js";

import { TextureProcessor } from "./TextureProcessor.js";
import {
  VISUALIZATION_MODES,
  createFilterModes,
  createProcessingUniforms,
} from "./config/uniforms.js";
import { loadProcessingShaders } from "./shaders/loadShaders.js";

// const VIDEO_SOURCE = "video.mp4";
const VIDEO_SOURCE = "video-lowQ.mp4";
const KERNEL_RADIUS_OPTIONS = [1, 3, 5, 7];

let camera;
let controls;
let scene;
let renderer;
let video;
let videoTexture;
let processingMaterial;

let gaussianController;
let laplacianController;
let separableGaussianController;
let denoisingController;
let kController;
let sigmaController;
let separableKController;
let separableSigmaController;
let selectedPlane = 1; // 0: originalTop, 1: originalBottom

let trueAnaglyphController;
let grayAnaglyphController;
let colorAnaglyphController;
let halfColorAnaglyphController;
let optimizedAnaglyphController;

const filterModes = createFilterModes();
const anaglyphModes = {
  trueAnaglyph: false,
  grayAnaglyph: false,
  colorAnaglyph: false,
  halfColorAnaglyph: false,
  optimizedAnaglyph: false,
};
const laplacianSettings = {
  visualizationMode: "Color",
};

const planes = {
  originalTop: {
    mesh: null,
    displayMaterial: null,
    processor: null,
    processingMaterial: null,
    filterMode: createFilterModes(),
  },
  originalBottom: {
    mesh: null,
    displayMaterial: null,
    processor: null,
    processingMaterial: null,
    filterMode: createFilterModes(),
  },
  anaglyph: {
    mesh: null,
    displayMaterial: null,
    processor: null,
    processingMaterial: null,
  },
};

init();
animate();

async function init() {
  if (WEBGL.isWebGL2Available() === false) {
    document.body.appendChild(WEBGL.getWebGL2ErrorMessage());
    return;
  }

  const shaders = await loadProcessingShaders();

  setupRenderer();
  setupScene();
  setupControls();
  setupVideo(shaders);

  window.addEventListener("resize", onWindowResize);
}

function createEditablePlane(position, shaders, videoW, videoH, videoTexture) {
  const filterMode = createFilterModes();

  const processingMaterial = new THREE.RawShaderMaterial({
    uniforms: createProcessingUniforms(filterMode, videoTexture),
    vertexShader: shaders.vertexShader,
    fragmentShader: shaders.processorFragmentShader,
    glslVersion: THREE.GLSL3,
  });

  const processor = new TextureProcessor(videoW, videoH, processingMaterial);

  const displayMaterial = new THREE.MeshBasicMaterial({
    map: processor.renderTarget.texture,
    side: THREE.DoubleSide,
  });

  const aspectRatio = videoH / videoW;
  const geometry = new THREE.PlaneGeometry(1, aspectRatio);
  const mesh = new THREE.Mesh(geometry, displayMaterial);
  mesh.position.copy(position);
  scene.add(mesh);

  return {
    mesh,
    displayMaterial,
    processor,
    processingMaterial,
    filterMode,
  };
}

function createCombinedPlane(position, shaders, videoW, videoH, videoTexture) {
  const processingMaterial = new THREE.RawShaderMaterial({
    uniforms: {
      leftTexture: { value: videoTexture },
      rightTexture: { value: videoTexture },
      trueAnaglyph: { value: false },
      grayAnaglyph: { value: false },
      colorAnaglyph: { value: false },
      halfColorAnaglyph: { value: false },
      optimizedAnaglyph: { value: false },
    },
    vertexShader: shaders.vertexShader,
    fragmentShader: shaders.stereoFragmentShader,
    glslVersion: THREE.GLSL3,
  });

  const processor = new TextureProcessor(videoW, videoH, processingMaterial);
  const displayMaterial = new THREE.MeshBasicMaterial({
    map: processor.renderTarget.texture,
    side: THREE.DoubleSide,
  });

  const aspectRatio = videoH / videoW;
  const geometry = new THREE.PlaneGeometry(1, aspectRatio);
  const mesh = new THREE.Mesh(geometry, displayMaterial);
  mesh.position.copy(position);
  scene.add(mesh);

  return {
    mesh,
    displayMaterial,
    processor,
    processingMaterial,
  };
}

function setupRenderer() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2");
  document.body.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({
    canvas,
    context,
  });
  renderer.autoClear = false;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.001,
    10,
  );
  camera.position.z = 1.0;
}

function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 0.005;
  controls.maxDistance = 2.0;
  controls.enableRotate = true;
}

function setupVideo(shaders) {
  video = document.createElement("video");
  video.src = VIDEO_SOURCE;
  video.load();
  video.muted = true;
  video.loop = true;

  video.onloadeddata = () => {
    videoTexture = createVideoTexture(video);
    processingMaterial = createProcessingMaterial(shaders, videoTexture);

    planes.originalTop = createEditablePlane(
      new THREE.Vector3(0, 0.35, -0.15),
      shaders,
      video.videoWidth,
      video.videoHeight,
      videoTexture,
    );
    planes.originalBottom = createEditablePlane(
      new THREE.Vector3(0, -0.35, -0.15),
      shaders,
      video.videoWidth,
      video.videoHeight,
      videoTexture,
    );
    planes.anaglyph = createCombinedPlane(
      new THREE.Vector3(0, 0, 0.15),
      shaders,
      video.videoWidth,
      video.videoHeight,
      videoTexture,
    );
    setupGUI();
    video.play();
  };
}

function createVideoTexture(sourceVideo) {
  const texture = new THREE.VideoTexture(sourceVideo);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.format = THREE.RGBAFormat;
  return texture;
}

function createProcessingMaterial(shaders, inputTexture) {
  return new THREE.RawShaderMaterial({
    uniforms: createProcessingUniforms(filterModes, inputTexture),
    vertexShader: shaders.vertexShader,
    fragmentShader: shaders.processorFragmentShader,
    glslVersion: THREE.GLSL3,
  });
}

function setupGUI() {
  const gui = new GUI();

  const planeEditsFolder = gui.addFolder("Plane Edits");
  planeEditsFolder
    .add({ selectedPlane }, "selectedPlane", {
      Top: 0,
      Bottom: 1,
    })
    .name("Active Plane")
    .onChange((value) => {
      selectedPlane = parseInt(value);
      syncGUIFromActivePlane();
    });

  const visualizationFolder = gui.addFolder("Anaglyph Visualization");
  trueAnaglyphController = visualizationFolder
    .add(anaglyphModes, "trueAnaglyph")
    .name("True Anaglyph")
    .onChange((v) => setExclusiveAnaglyphMode("trueAnaglyph", v));
  grayAnaglyphController = visualizationFolder
    .add(anaglyphModes, "grayAnaglyph")
    .name("Gray Anaglyph")
    .onChange((v) => setExclusiveAnaglyphMode("grayAnaglyph", v));
  colorAnaglyphController = visualizationFolder
    .add(anaglyphModes, "colorAnaglyph")
    .name("Color Anaglyph")
    .onChange((v) => setExclusiveAnaglyphMode("colorAnaglyph", v));
  halfColorAnaglyphController = visualizationFolder
    .add(anaglyphModes, "halfColorAnaglyph")
    .name("Half-Color Anaglyph")
    .onChange((v) => setExclusiveAnaglyphMode("halfColorAnaglyph", v));
  optimizedAnaglyphController = visualizationFolder
    .add(anaglyphModes, "optimizedAnaglyph")
    .name("Optimized Anaglyph")
    .onChange((v) => setExclusiveAnaglyphMode("optimizedAnaglyph", v));
  gaussianController = planeEditsFolder
    .add(filterModes, "gaussian")
    .name("Gaussian Blur")
    .onChange((v) => setExclusiveMode("gaussian", v));
  kController = planeEditsFolder
    .add(processingMaterial.uniforms.k, "value", KERNEL_RADIUS_OPTIONS)
    .name("Kernel Radius");
  sigmaController = planeEditsFolder
    .add(processingMaterial.uniforms.sigma, "value", 0.5, 5.0, 0.1)
    .name("Sigma")
    .onChange((value) => {
      getActivePlane().processingMaterial.uniforms.sigma.value = value;
    });
  kController.onChange((value) => {
    getActivePlane().processingMaterial.uniforms.k.value = value;
  });

  separableGaussianController = planeEditsFolder
    .add(filterModes, "separableGaussian")
    .name("Separable Gaussian")
    .onChange((v) => setExclusiveMode("separableGaussian", v));
  separableKController = planeEditsFolder
    .add(processingMaterial.uniforms.separableK, "value", KERNEL_RADIUS_OPTIONS)
    .name("Kernel Radius");
  separableSigmaController = planeEditsFolder
    .add(processingMaterial.uniforms.separableSigma, "value", 0.5, 5.0, 0.1)
    .name("Sigma")
    .onChange((value) => {
      getActivePlane().processingMaterial.uniforms.separableSigma.value = value;
    });
  separableKController.onChange((value) => {
    getActivePlane().processingMaterial.uniforms.separableK.value = value;
  });

  laplacianController = planeEditsFolder
    .add(filterModes, "laplacian")
    .name("Laplacian Filter")
    .onChange((v) => setExclusiveMode("laplacian", v));
  planeEditsFolder
    .add(laplacianSettings, "visualizationMode", ["Color", "Normal"])
    .name("Visualization Mode")
    .onChange((value) => {
      getActivePlane().processingMaterial.uniforms.visualizationMode.value =
        value === "Color"
          ? VISUALIZATION_MODES.COLOR
          : VISUALIZATION_MODES.NORMAL;
    });

  denoisingController = planeEditsFolder
    .add(filterModes, "denoising")
    .name("Enable Denoising")
    .onChange((v) => setExclusiveMode("denoising", v));

  const videoControls = {
    togglePlayPause: () => {
      if (video.paused) video.play();
      else video.pause();
    },
    skipForward: () => {
      video.currentTime += 10;
    },
  };

  gui.add(videoControls, "togglePlayPause").name("Play / Pause");
  gui.add(videoControls, "skipForward").name("Skip +10s");
}

function setExclusiveAnaglyphMode(mode, enabled) {
  const uniforms = planes.anaglyph.processingMaterial.uniforms;
  anaglyphModes[mode] = enabled;
  uniforms[mode].value = enabled;

  if (enabled) {
    for (const other of Object.keys(anaglyphModes)) {
      if (other === mode) continue;
      anaglyphModes[other] = false;
      uniforms[other].value = false;
    }
  }

  refreshAnaglyphControllers();
}

function refreshAnaglyphControllers() {
  trueAnaglyphController.updateDisplay();
  grayAnaglyphController.updateDisplay();
  colorAnaglyphController.updateDisplay();
  halfColorAnaglyphController.updateDisplay();
  optimizedAnaglyphController.updateDisplay();
}

function setExclusiveMode(mode, enabled) {
  const activePlane = getActivePlane();
  activePlane.filterMode[mode] = enabled;
  activePlane.processingMaterial.uniforms[mode].value = enabled;

  if (enabled) {
    for (const otherMode of Object.keys(activePlane.filterMode)) {
      if (otherMode === mode) continue;
      activePlane.filterMode[otherMode] = false;
      activePlane.processingMaterial.uniforms[otherMode].value = false;
    }
  }

  syncFilterModeProxy(activePlane);
  refreshModeControllers();
  updateProcessedDisplayTexture();

  if (!hasActiveFilter(activePlane)) {
    activePlane.processor.clearAll(renderer);
  }
}

function refreshModeControllers() {
  gaussianController.updateDisplay();
  laplacianController.updateDisplay();
  separableGaussianController.updateDisplay();
  denoisingController.updateDisplay();
}

function hasActiveFilter(plane) {
  if (!plane.filterMode) {
    return false;
  }

  return Object.values(plane.filterMode).some(Boolean);
}

function updateProcessedDisplayTexture() {
  for (const planeKey of Object.keys(planes)) {
    const plane = planes[planeKey];
    if (plane.displayMaterial && plane.filterMode) {
      plane.displayMaterial.map = hasActiveFilter(plane)
        ? plane.processor.renderTarget.texture
        : videoTexture;
      plane.displayMaterial.needsUpdate = true;
    }
  }
}

function processSeparableGaussian(plane) {
  plane.processingMaterial.uniforms.imageTexture.value = videoTexture;
  plane.processingMaterial.uniforms.horizontalFlag.value = true;
  plane.processor.process(renderer, plane.processor.intermediateRenderTarget);

  plane.processingMaterial.uniforms.imageTexture.value =
    plane.processor.intermediateRenderTarget.texture;
  plane.processingMaterial.uniforms.horizontalFlag.value = false;
  plane.processor.process(renderer);

  plane.processingMaterial.uniforms.imageTexture.value = videoTexture;
}

function processCurrentFrame() {
  if (
    !planes.originalTop.processor ||
    !planes.originalBottom.processor ||
    !planes.anaglyph.processor
  ) {
    return;
  }

  for (const planeKey of Object.keys(planes)) {
    const plane = planes[planeKey];
    if (plane.processor) {
      plane.processor.clear(renderer);
    }
  }
  for (const plane of [planes.originalTop, planes.originalBottom]) {
    if (!hasActiveFilter(plane)) {
      continue;
    }

    if (plane.filterMode.separableGaussian) {
      processSeparableGaussian(plane);
    } else {
      plane.processingMaterial.uniforms.imageTexture.value = videoTexture;
      plane.processor.process(renderer);
    }
  }

  planes.anaglyph.processingMaterial.uniforms.leftTexture.value =
    hasActiveFilter(planes.originalTop)
      ? planes.originalTop.processor.renderTarget.texture
      : videoTexture;
  planes.anaglyph.processingMaterial.uniforms.rightTexture.value =
    hasActiveFilter(planes.originalBottom)
      ? planes.originalBottom.processor.renderTarget.texture
      : videoTexture;
  planes.anaglyph.processor.process(renderer);
}

function getActivePlane() {
  return selectedPlane === 0 ? planes.originalTop : planes.originalBottom;
}

function syncFilterModeProxy(plane) {
  for (const mode of Object.keys(filterModes)) {
    filterModes[mode] = plane.filterMode[mode];
  }
}

function syncGUIFromActivePlane() {
  const plane = getActivePlane();
  syncFilterModeProxy(plane);

  processingMaterial.uniforms.k.value =
    plane.processingMaterial.uniforms.k.value;
  processingMaterial.uniforms.sigma.value =
    plane.processingMaterial.uniforms.sigma.value;
  processingMaterial.uniforms.separableK.value =
    plane.processingMaterial.uniforms.separableK.value;
  processingMaterial.uniforms.separableSigma.value =
    plane.processingMaterial.uniforms.separableSigma.value;

  refreshModeControllers();
  kController.updateDisplay();
  sigmaController.updateDisplay();
  separableKController.updateDisplay();
  separableSigmaController.updateDisplay();
}

function onWindowResize() {
  if (!camera || !renderer) {
    return;
  }

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !camera) {
    return;
  }

  if (controls) {
    controls.update();
  }

  renderer.clear();
  processCurrentFrame();
  renderer.render(scene, camera);
}
