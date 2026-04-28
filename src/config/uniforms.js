export const VISUALIZATION_MODES = {
  COLOR: 0,
  NORMAL: 1,
};

export function createFilterModes() {
  return {
    gaussian: true,
    laplacian: false,
    separableGaussian: false,
    denoising: false,
  };
}

export function createProcessingUniforms(filterModes, videoTexture) {
  return {
    gaussian: { value: filterModes.gaussian },
    k: { value: 3 },
    sigma: { value: 1.5 },

    laplacian: { value: filterModes.laplacian },
    visualizationMode: { value: VISUALIZATION_MODES.COLOR },

    separableGaussian: { value: filterModes.separableGaussian },
    separableK: { value: 3 },
    separableSigma: { value: 1.5 },
    horizontalFlag: { value: true },

    denoising: { value: filterModes.denoising },

    imageTexture: { value: videoTexture },
  };
}
