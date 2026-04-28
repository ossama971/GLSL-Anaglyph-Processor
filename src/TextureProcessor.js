import * as THREE from "three";

export class TextureProcessor {
  constructor(width, height, processingMaterial) {
    this.width = width;
    this.height = height;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    };

    this.renderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      renderTargetOptions,
    );
    this.intermediateRenderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      renderTargetOptions,
    );

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -1, -1, 0,
      1, -1, 0,
      1, 1, 0,
      -1, -1, 0,
      1, 1, 0,
      -1, 1, 0,
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    this.quadMesh = new THREE.Mesh(geometry, processingMaterial);
    this.scene.add(this.quadMesh);
  }

  process(renderer, renderTarget = this.renderTarget) {
    const previousRenderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(renderTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previousRenderTarget);
  }

  clear(renderer, renderTarget = this.renderTarget) {
    const previousRenderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(renderTarget);
    renderer.clear(true, true, true);
    renderer.setRenderTarget(previousRenderTarget);
  }

  clearAll(renderer) {
    this.clear(renderer, this.renderTarget);
    this.clear(renderer, this.intermediateRenderTarget);
  }
}
