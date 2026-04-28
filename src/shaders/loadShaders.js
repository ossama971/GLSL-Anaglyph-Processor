export async function loadShader(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load shader "${path}": ${response.status}`);
  }

  return response.text();
}

export async function loadProcessingShaders() {
  const [vertexShader, processorFragmentShader, stereoFragmentShader] =
    await Promise.all([
      loadShader("./src/shaders/vertex.glsl"),
      loadShader("./src/shaders/processorFragment.glsl"),
      loadShader("./src/shaders/stereoFragment.glsl"),
    ]);

  return { vertexShader, processorFragmentShader, stereoFragmentShader };
}
